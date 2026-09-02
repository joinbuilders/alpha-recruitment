import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import OfflineSupport from "@/components/OfflineSupport";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "BUILDERS",
  description: "Your building starts today.",
};

export const viewport: Viewport = {
  themeColor: "#050607",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <link rel="preconnect" href="https://use.typekit.net" crossOrigin="" />
      <link rel="stylesheet" href="https://use.typekit.net/kfv5cnk.css" />
      <body className={`${inter.variable} font-mono antialiased`}>
        {children}
        <OfflineSupport />
      </body>
    </html>
  );
}
