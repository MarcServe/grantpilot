import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GrantsCopilot — AI-Powered Grant Discovery & Preparation",
  description:
    "Find fresh grants, check eligibility against your company DNA, and prepare funder-ready documents and application tasks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
        <Analytics />
        <Script
          src="https://talkweb.io/widget.js"
          strategy="afterInteractive"
          data-assistant="5572556c-ab93-425e-abe4-1363a7157e4f"
          data-base-url="https://talkweb.io"
        />
      </body>
    </html>
  );
}
