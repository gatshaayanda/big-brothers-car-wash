import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import PwaRegister from "@/app/pwa-register";
import "./globals.css";
import "./pwa.css";
import "./big-brothers.css";

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Big Brothers Car Wash", template: "%s | Big Brothers Car Wash" },
  description: "Book a car wash, request mobile service, and follow requests online or offline.",
  applicationName: "Big Brothers Car Wash",
  keywords: ["Big Brothers Car Wash", "PWA", "mobile app", "offline", "installation"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: siteUrl, siteName: "Big Brothers Car Wash", title: "Big Brothers Car Wash", description: "Car wash bookings, mobile-service requests and live staff operations." },
  twitter: { card: "summary", title: "Big Brothers Car Wash", description: "Car wash bookings, mobile-service requests and live staff operations." },
  icons: {
    icon: [
      { url: "/big-brothers-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/big-brothers-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/big-brothers-icon-180.png", sizes: "180x180", type: "image/png" }
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Big Brothers Car Wash", statusBarStyle: "default" }
};

export const viewport: Viewport = { themeColor: "#ed1c24", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <PwaRegister />{children}<Analytics /><SpeedInsights />
  </body></html>;
}
