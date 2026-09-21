export const metadata = { title: "Terms of Service — KraTte" };

export default function TermsPage() {
  return (
    <main
      style={{ background: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}
      className="px-5 py-10"
    >
      <div className="mx-auto max-w-[640px]">
        <div className="kicker">Legal</div>
        <h1 className="mt-1 font-display text-[28px]">Terms of Service</h1>
        <p className="mt-1 text-[13px] text-muted">Last updated: September 2026</p>

        <div className="mt-6 flex flex-col gap-5 text-[14px] leading-relaxed">
          <p>
            These terms cover your use of KraTte, a tool for tracking
            inventory, orders, and expenses for a small shop. By creating an
            account, you agree to them.
          </p>

          <section>
            <h2 className="font-display text-[18px]">The service</h2>
            <p className="mt-2">
              KraTte lets you record sales, expenses, and stock, and
              optionally capture them via WhatsApp using photo/text
              recognition. We aim to keep the service available and accurate,
              but don't guarantee it will be error-free or uninterrupted.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Your account</h2>
            <p className="mt-2">
              You're responsible for the accuracy of the data you enter and
              for keeping your login secure. You're responsible for activity
              that happens under your account.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Acceptable use</h2>
            <p className="mt-2">
              Use KraTte for your own legitimate business record-keeping.
              Don't use it to submit fraudulent payment claims, attempt to
              access another business's data, or abuse the WhatsApp
              integration.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Plans and payment</h2>
            <p className="mt-2">
              Paid plans are activated after we manually verify a submitted
              mobile money payment against the claimed amount and reference.
              This review isn't instant. We reserve the right to decline a
              claim that doesn't match an actual payment.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">AI-assisted capture</h2>
            <p className="mt-2">
              Sales and expenses captured from a photo or WhatsApp message are
              read automatically and may occasionally be misread. Review
              what's recorded — we're not liable for losses from a
              misclassified entry.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Disclaimer & liability</h2>
            <p className="mt-2">
              KraTte is provided "as is," without warranties of any kind. To
              the extent permitted by law, we aren't liable for indirect or
              consequential damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Ending your account</h2>
            <p className="mt-2">
              You can stop using KraTte at any time. We may suspend or end an
              account that violates these terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Changes</h2>
            <p className="mt-2">
              We may update these terms as the service evolves. Continued use
              after a change means you accept the update.
            </p>
          </section>

          <section>
            <h2 className="font-display text-[18px]">Contact</h2>
            <p className="mt-2">
              Questions about these terms:{" "}
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
