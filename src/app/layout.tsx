import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { SyncToast } from "./SyncToast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fridge Explorer",
  description: "Turn what's in your fridge into a balanced daily meal plan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <nav className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-lg items-center gap-6 px-6 py-3">
            <Link href="/plan" className="text-sm font-bold">
              🍽️ Fridge Explorer
            </Link>
            <div className="flex gap-4 text-sm">
              <Link href="/plan" className="hover:underline">
                Plan
              </Link>
              <Link href="/supplies" className="hover:underline">
                Supplies
              </Link>
              <Link href="/snacks" className="hover:underline">
                Snacks
              </Link>
              <Link href="/settings" className="hover:underline">
                Settings
              </Link>
            </div>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
        <SyncToast />
      </body>
    </html>
  );
}
