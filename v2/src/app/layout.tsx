import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { TenantProvider } from "@/context/TenantContext";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Synculariti - Tracker",
  description: "Intelligent tenant expense tracking",
  manifest: "/manifest.json",
  // Next.js 14 proper favicon handling
  icons: {
    icon: [
      { url: "/brand/identity.png", type: "image/png" },
    ],
    apple: [
      { url: "/brand/identity.png" },
    ],
    shortcut: "/brand/identity.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Synculariti - Tracker",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0F172A" }
  ]
};

import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

import { IdentityGateWrapper } from "@/modules/identity/IdentityGateWrapper";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TenantProvider>
          <IdentityGateWrapper>
            <NavBar />
            <div className="app-container">
              {children}
            </div>
            <MobileBottomNav />
            <PWAInstallPrompt />
          </IdentityGateWrapper>
        </TenantProvider>
      </body>
    </html>
  );
}
