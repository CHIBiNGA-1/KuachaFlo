export const metadata = { title: "Privacy Policy — KraTte" };

export default function PrivacyPage() {
  return (
    <main
      style={{ background: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}
      className="px-5 py-10"
    >
      <div className="mx-auto max-w-[640px]">
        <div className="kicker">Legal</div>
        <h1 className="mt-1 font-display text-[28px]">Privacy Policy</h1>
        <p className="mt-1 text-[13px] text-muted">Last updated: September 2026</p>

        <div className="mt-6 flex flex-col gap-5 text-[14px] leading-relaxed">
          <p>
            KraTte ("we", "us") helps shop owners track inventory, orders, and
            expenses. This page explains what information we collect and how
            it's used. It applies to the KraTte web app and its WhatsApp
            integration.
          </p>

          <section>
            <h2 className="font-display text-[18px]">Information we collect</h2>
            <ul className="mt-2 list-disc pl-5">
              <li>
                <b>Account info</b> — your email address, via Supabase Auth
                (email/password or "Sign in with Google").
              </li>
              <li>
                <b>Shop data</b> — products, orders, customers, expenses, and
                suppliers you enter into the app.
              </li>
              <li>
                <b>WhatsApp number</b> — only if you choose to link WhatsApp,
                so we can receive and reply to your messages.
              </li>
              <li>
                <b>Photos and messages you send us on WhatsApp</b> — sales
                tallies or supplier notes you photograph or type, so we can
                read them into your ledger.
              </li>
              <li>
                <b>Payment claims</b> — the mobile money network, transaction
                reference, and (optionally) the number you paid from, when you
                submit a plan upgrade. We do not collect or store card or bank
                account numbers.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-[18px]">How we use it</h2>
            <p className="mt-2">
              To run the app: storing your shop's records, showing them back
              to you, and turning a WhatsApp photo or message into a ledger
              entry. We don't sell your data or use it for advertising.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Who else sees it</h2>
            <ul className="mt-2 list-disc pl-5">
              <li>
                <b>Supabase</b> — hosts our database and handles sign-in.
              </li>
              <li>
                <b>Render</b> — hosts our backend server.
              </li>
              <li>
                <b>Google (Gemini API)</b> — reads the photos and text you
                send via WhatsApp to pull out items and amounts. Google
                processes this on our behalf and doesn't use it to train
                public models.
              </li>
              <li>
                <b>Meta (WhatsApp Business Platform)</b> — delivers the
                messages between you and KraTte, if you link WhatsApp.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Data retention & deletion</h2>
            <p className="mt-2">
              We keep your data for as long as your account is active. To
              delete your account and its data, email us at the address
              below.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Children</h2>
            <p className="mt-2">
              KraTte is a business tool and isn't directed at children.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Changes</h2>
            <p className="mt-2">
              If this policy changes in a meaningful way, we'll update the
              date above.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Contact</h2>
            <p className="mt-2">
              Questions about this policy or your data:{" "}
              <a
                href="mailto:chibingatheace@gmail.com"
                style={{ color: "var(--ink)", textDecoration: "underline" }}
              >
                chibingatheace@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
