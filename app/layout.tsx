import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google"; // 1. Import fontů
import "./globals.css";
import { Providers } from "@/components/Providers";

// 2. Konfigurace fontů
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quackr",
  description: "Swipe through the news, spot the fakes, and test your intuition.",
  icons: {
    icon: "/Logo3.svg",
    shortcut: "/Logo3.svg",
    apple: "/Logo3.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* 3. Přidání proměnných fontů do className */}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}