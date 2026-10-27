import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Big Brothers Car Wash",
    short_name: "Big Bros",
    description: "Book a car wash, request mobile service, and follow requests online or offline.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ed1c24",
    orientation: "portrait-primary",
    lang: "en",
    categories: ["business", "lifestyle"],
    prefer_related_applications: false,
    icons: [
      { src: "/big-brothers-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/big-brothers-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/big-brothers-icon-180.png", sizes: "180x180", type: "image/png", purpose: "any" }
    ],
    screenshots: [
      { src: "/pwa-screenshot-wide.svg", sizes: "1280x720", type: "image/svg+xml", form_factor: "wide", label: "Big Brothers Car Wash desktop booking screen" },
      { src: "/pwa-screenshot-mobile.svg", sizes: "720x1280", type: "image/svg+xml", form_factor: "narrow", label: "Big Brothers Car Wash mobile booking screen" }
    ]
  };
}
