import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "KraTte — Run your shop with clarity",
  description: "Inventory, orders, and daily operations in one calm workspace.",
  manifest: "/manifest.json",
  verification: {
    google: "TXEwYALHtoCPufmz5HZBXVUF12ezugbGvUcfdwqiWzY",
  },
  appleWebApp: {
    capable: true,
    title: "KraTte",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#fdfbf7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
