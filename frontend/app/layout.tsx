import type { Metadata } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f3ee",
};

export const metadata: Metadata = {
  title: "KuachaFlo — Expense capture, without friction",
  description:
    "Snap a receipt, Gemini reads it and auto-categorizes it instantly. Real expense tracking, zero spreadsheets.",
  manifest: "/manifest.json",
  applicationName: "KuachaFlo",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KuachaFlo",
  },
  openGraph: {
    title: "KuachaFlo — Expense capture, without friction",
    description: "Snap a receipt, get it auto-categorized instantly.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
