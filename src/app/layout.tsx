import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const unbounded = Unbounded({ subsets: ["latin"], variable: "--font-unbounded", weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "KROMA OS", template: "%s · KROMA OS" },
  description: "KROMA — Sua marca em outra frequência. Central de operações da agência.",
  icons: { icon: "/icon-64.png", apple: "/apple-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#F4F2F7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${unbounded.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
