import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.grantscopilot.com";
const title = "GrantsCopilot — AI-Powered Grant Discovery & Preparation";
const description =
  "Find fresh grants, check eligibility against your company DNA, and prepare funder-ready documents and application tasks.";
const shareImage = "/grantscopilot-social-preview.jpg";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title,
  description,
  applicationName: "GrantsCopilot",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title,
    description,
    url: appUrl,
    siteName: "GrantsCopilot",
    type: "website",
    images: [
      {
        url: shareImage,
        width: 1200,
        height: 1200,
        type: "image/jpeg",
        alt: "GrantsCopilot grant discovery and application preparation assistant",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [shareImage],
  },
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
