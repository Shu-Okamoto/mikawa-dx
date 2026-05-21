import type { Metadata } from "next";
import { Geist, Geist_Mono, BIZ_UDPGothic } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bizUDP = BIZ_UDPGothic({
  variable: "--font-biz-udp",
  weight  : ["400", "700"],
  subsets : ["latin"],
  display : "swap",
});

export const metadata: Metadata = {
  title: "里の味みかわ",
  description: "業務管理システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${bizUDP.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
