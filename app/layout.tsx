import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArmBox｜さいたま市 商圏分析",
  description: "共同開発様向けの町丁目別商圏分析マップ",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
