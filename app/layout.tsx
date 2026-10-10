import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support Bot", description: "Multi-client customer support bots" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
