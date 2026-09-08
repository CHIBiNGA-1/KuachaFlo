import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ShopProvider } from "@/components/shop-provider";
import "./globals.css";
import "./reliability.css";
import "./inventory.css";
import "./calm.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "KraTte — A good day to do business",
  description:
    "Your shelves, sales, and people. Finally, all in a good place. A thoughtful workspace for local stores and wholesale businesses.",
  applicationName: "KraTte",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <ShopProvider>{children}</ShopProvider>
      </body>
    </html>
  );
}
