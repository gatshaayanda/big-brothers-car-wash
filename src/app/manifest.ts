import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Iteration 13 | Service Studio",
    short_name: "Studio 13",
    description: "A mobile-first service-order demo with customer requests, local admin tools, installation guidance and offline-aware behavior.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f0",
    theme_color: "#155eef",
    orientation: "portrait-primary",
    lang: "en",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      { src: "/iteration13-icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/iteration13-icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/iteration13-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
    ],
    shortcuts: [
      {
        name: "Browse services",
        short_name: "Services",
        description: "Explore the service menu and submit a request",
        url: "/",
        icons: [{ src: "/iteration13-icon-192.svg", sizes: "192x192", type: "image/svg+xml" }]
      },
      {
        name: "My account",
        short_name: "Account",
        description: "Review your local demo requests",
        url: "/?view=account",
        icons: [{ src: "/iteration13-icon-192.svg", sizes: "192x192", type: "image/svg+xml" }]
      },
      {
        name: "Admin demo",
        short_name: "Admin",
        description: "Open the local prototype operations panel",
        url: "/#admin",
        icons: [{ src: "/iteration13-icon-192.svg", sizes: "192x192", type: "image/svg+xml" }]
      }
    ]
  };
}
