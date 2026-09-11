from PIL import Image, ImageDraw, ImageFont

ACCENT = (217, 239, 103)      # --accent
INK = (36, 48, 0)             # --accent-ink
DARK = (21, 25, 26)           # --ink

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def rounded_square(size, radius_ratio, bg):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=bg)
    return img, d

def draw_mark(d, size, color, scale=1.0):
    # Simple receipt + spark mark: a rounded rect "card" with a corner clip and a scan line
    cx, cy = size / 2, size / 2
    w = size * 0.34 * scale
    h = size * 0.40 * scale
    x0, y0 = cx - w / 2, cy - h / 2
    x1, y1 = cx + w / 2, cy + h / 2
    # card body
    d.rounded_rectangle([x0, y0, x1, y1], radius=size * 0.035, fill=color)
    # notch cut (zig-zag bottom) simplified as small triangle cut
    # two lines (like text lines) - cut out using background-ish thinner rects (draw as gaps)
    line_w = w * 0.6
    line_h = size * 0.028
    for i, frac in enumerate([0.34, 0.5, 0.66]):
        ly = y0 + h * frac
        lw = line_w if i < 2 else line_w * 0.55
        d.rounded_rectangle(
            [cx - lw / 2, ly - line_h / 2, cx + lw / 2, ly + line_h / 2],
            radius=line_h / 2,
            fill=ACCENT,
        )

def make_icon(size, maskable=False, filename=None):
    bg = ACCENT
    radius_ratio = 0.5 if maskable else 0.22  # maskable exports as full bleed square; OS applies its own mask
    img, d = rounded_square(size, radius_ratio if not maskable else 0, bg)
    if maskable:
        # full bleed square background (safe zone handled by scaling mark down)
        img = Image.new("RGBA", (size, size), ACCENT)
        d = ImageDraw.Draw(img)
        draw_mark(d, size, INK, scale=0.62)  # smaller so it survives circular crop
    else:
        draw_mark(d, size, INK, scale=1.0)
    img.save(filename)
    print("saved", filename, size)

make_icon(192, maskable=False, filename="icon-192.png")
make_icon(512, maskable=False, filename="icon-512.png")
make_icon(192, maskable=True, filename="icon-maskable-192.png")
make_icon(512, maskable=True, filename="icon-maskable-512.png")

# apple touch icon - opaque background required (no transparency), slightly less rounding since iOS applies its own mask
apple = Image.new("RGB", (180, 180), ACCENT)
d = ImageDraw.Draw(apple)
draw_mark(d, 180, INK, scale=1.0)
apple.save("apple-touch-icon.png")
print("saved apple-touch-icon.png")

# favicon.ico (multi-size)
fav_img, fd = rounded_square(64, 0.22, ACCENT)
draw_mark(fd, 64, INK, scale=1.0)
fav_img.save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("saved favicon.ico")
