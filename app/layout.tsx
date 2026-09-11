import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KuachaFlo",
  description: "One account. Two paths. Choose once.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
