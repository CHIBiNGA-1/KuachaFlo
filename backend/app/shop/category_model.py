"""Product-name → category model.

Small on purpose, but a real model rather than a keyword lookup:

  * Multinomial Naive Bayes over two feature families — whole words
    (lightly stemmed, so "biscuits" ≈ "biscuit") and character trigrams
    (so "Colgat" or "Sunlite" still land near "Colgate"/"Sunlight").
  * Trained on the fly from the shop's own products. Every saved product
    is a labeled example, so it learns from one example and every
    correction the owner makes is next time's training data — nothing to
    retrain, store, or migrate. Newer products weigh slightly more, so
    the model follows how the shop names things as it changes.
  * A built-in seed vocabulary enters as low-weight pseudo-examples, so a
    brand-new shop still gets sensible guesses. It's a prior, not a
    fallback: the shop's own data outvotes it the moment the two disagree.
  * Confidence-gated. It returns a category only when the posterior is
    clearly ahead; a wrong auto-fill that the owner has to notice and
    undo is worse than leaving the field alone.

Pure Python, no dependencies, deterministic, and cheap enough to rebuild
per request for any realistic shop size.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import defaultdict

from app.shop.validate import INVENTORY_CATEGORIES

CATEGORIES = [c for c in INVENTORY_CATEGORIES if c != "Other"]

# Words that describe size/packaging, not what the thing *is*.
_NOISE = {
    "ml", "l", "ltr", "litre", "liter", "g", "gm", "kg", "mg", "pcs", "pc", "pack",
    "packs", "pk", "box", "bottle", "bottles", "can", "cans", "small", "medium",
    "large", "big", "mini", "family", "size", "the", "and", "of", "with", "for",
    "new", "original", "classic", "assorted", "x", "twin", "single", "double",
}

# Seed knowledge: category → words that strongly suggest it. Used only as
# a weak prior (see SEED_WEIGHT); a shop's own labeled products override it.
_SEED = {
    "Beverages": "soda cola coke pepsi fanta sprite juice water beer wine cider "
                 "whisky vodka gin drink tea coffee malt energy milkshake squash "
                 "mazoe lager",
    "Pantry": "rice flour sugar salt oil pasta beans spaghetti maize mealie "
              "cereal sauce spice vinegar soup noodles lentils peanut kapenta "
              "ketchup mayonnaise yeast",
    "Fresh & dairy": "milk egg cheese yogurt yoghurt bread meat chicken beef "
                     "fish butter margarine vegetable fruit tomato onion potato "
                     "banana apple cabbage sausage",
    "Snacks": "chips crisps biscuit chocolate candy sweet popcorn cookie nuts gum "
              "lollipop wafer cracker doughnut cake",
    "Personal care & household": "soap shampoo toothpaste toothbrush lotion "
              "deodorant tissue pad razor perfume sanitizer vaseline conditioner "
              "detergent bleach broom mop bulb candle matches cleaner sponge "
              "bucket bag omo jik harpic polish",
    "Gadgets": "charger cable usb earphones earbuds headphones phone case "
               "powerbank adapter speaker bluetooth mouse keyboard torch solar "
               "radio flash memory sd battery batteries screen protector watch "
               "router",
}

SEED_WEIGHT = 0.8        # a seed word ≈ 0.8 of one real example
TRIGRAM_WEIGHT = 0.25    # char trigrams are supporting evidence only
ALPHA = 0.05            # light smoothing: one example should already count
PRIOR_TEMPER = 0.5       # category frequency matters, but only gently
MIN_CONFIDENCE = 0.55    # below this, leave the field alone
MIN_MARGIN = 0.15        # …and the winner must clearly beat the runner-up


def _stem(w: str) -> str:
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 4 and w.endswith("es") and w[-3] in "sxz":
        return w[:-2]
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def _words(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    out = []
    for raw in re.findall(r"[a-zA-Z]+", text.lower()):
        if len(raw) < 2 or raw in _NOISE:
            continue
        out.append(_stem(raw))
    return out


def _features(text: str) -> dict[str, float]:
    feats: dict[str, float] = defaultdict(float)
    for w in _words(text):
        feats[f"w:{w}"] += 1.0
        if len(w) >= 4:
            padded = f"^{w}$"
            for i in range(len(padded) - 2):
                feats[f"t:{padded[i:i + 3]}"] += TRIGRAM_WEIGHT
    return feats


def predict(name: str, examples: list[tuple[str, str]]) -> dict:
    """`examples` are (product name, category), oldest → newest.

    Returns {"category": str | None, "confidence": float, "source": str}.
    `source` is "learned" when the shop's own history carried the
    decision, "seed" when only built-in knowledge did, else None.
    """
    query = _features(name)
    if not query:
        return {"category": None, "confidence": 0.0, "source": None}

    counts: dict[str, dict[str, float]] = {c: defaultdict(float) for c in CATEGORIES}
    totals: dict[str, float] = {c: 0.0 for c in CATEGORIES}
    class_mass: dict[str, float] = {c: 0.0 for c in CATEGORIES}
    shop_counts: dict[str, dict[str, float]] = {c: defaultdict(float) for c in CATEGORIES}

    # Seed words: weak pseudo-examples.
    for cat, words in _SEED.items():
        for w in words.split():
            for f, v in _features(w).items():
                counts[cat][f] += v * SEED_WEIGHT
                totals[cat] += v * SEED_WEIGHT

    # The shop's own products: real examples, newest weighted a bit more.
    n = max(len(examples), 1)
    for i, (pname, pcat) in enumerate(examples):
        if pcat == "Other" or pcat not in counts:
            continue  # "Other" is the absence of a signal, not a class to learn
        weight = 1.0 + 0.5 * (i / n)
        class_mass[pcat] += weight
        for f, v in _features(pname).items():
            counts[pcat][f] += v * weight
            totals[pcat] += v * weight
            shop_counts[pcat][f] += v * weight

    vocab = {f for c in CATEGORIES for f in counts[c]}
    known = {f: v for f, v in query.items() if f in vocab}
    if not known:
        return {"category": None, "confidence": 0.0, "source": None}

    v_size = len(vocab)
    mass_total = sum(class_mass.values()) + len(CATEGORIES)
    log_post: dict[str, float] = {}
    for c in CATEGORIES:
        score = PRIOR_TEMPER * math.log((class_mass[c] + 1.0) / mass_total)
        denom = totals[c] + ALPHA * v_size
        for f, q in known.items():
            score += q * math.log((counts[c].get(f, 0.0) + ALPHA) / denom)
        log_post[c] = score

    peak = max(log_post.values())
    exp = {c: math.exp(s - peak) for c, s in log_post.items()}
    z = sum(exp.values())
    post = {c: e / z for c, e in exp.items()}
    ranked = sorted(post.items(), key=lambda kv: kv[1], reverse=True)
    (best, p1), (_, p2) = ranked[0], ranked[1]

    if p1 < MIN_CONFIDENCE or (p1 - p2) < MIN_MARGIN:
        return {"category": None, "confidence": round(p1, 3), "source": None}

    learned = any(f in shop_counts[best] for f in known)
    return {"category": best, "confidence": round(p1, 3), "source": "learned" if learned else "seed"}
