import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";

import "./globals.css";

/**
 * Root layout & branded app shell (M9-T1).
 *
 * Manrope for UI, JetBrains Mono for numeric/stat readouts
 * (`design-reference.md` §4). Dark by default — `.dark` on <html>; a later
 * theme toggle flips it. `suppressHydrationWarning` covers a future client
 * theme write to the class.
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
      className={`dark ${manrope.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
