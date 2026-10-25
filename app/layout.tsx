import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpellSpoken",
  description: "A pronunciation roguelike. Speak the spell. Say it right, or it backfires.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Manrope:wght@400;500;600;700&family=Noto+Serif+SC:wght@300;400;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
