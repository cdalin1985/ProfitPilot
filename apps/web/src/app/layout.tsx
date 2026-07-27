import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AuthenticationProvider } from "@/components/authentication-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Profit Pilot",
    template: "%s · Profit Pilot",
  },
  description:
    "Affiliate opportunity discovery, grounded content operations, publishing, and measurement.",
  applicationName: "Profit Pilot",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#071c2f",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AuthenticationProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AuthenticationProvider>
      </body>
    </html>
  );
}
