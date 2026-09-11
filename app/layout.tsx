import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArmBox Lab",
  description: "ArmBoxの機能開発・検証サイト",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
