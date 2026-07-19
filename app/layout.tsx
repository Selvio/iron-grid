import type { Metadata } from "next";
import { Baloo_2, JetBrains_Mono, Manrope } from "next/font/google";

import "./globals.css";

/**
 * Root layout & branded app shell (M9-T1).
 *
 * Manrope for UI, JetBrains Mono for numeric/stat readouts, and Baloo 2 for the
 * game's display headings (`design-reference.md` §4, the Claude Design mockup).
 * The playful **light** theme (sky background, cream cards, navy ink) is the
 * default; `.dark` stays as an alternate palette. `suppressHydrationWarning`
 * covers a future client theme write to the class.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T1)
 */

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Iron Grid",
  description: "Turn-based strategy. Take the grid.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${jetBrainsMono.variable} ${baloo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col text-foreground">
        {children}
      </body>
    </html>
  );
}
