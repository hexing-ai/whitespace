import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "留白 WhiteSpace", description: "规划会上画出这期边界", icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
