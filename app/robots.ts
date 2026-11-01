import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://the-plug-pearl.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin/"] }, sitemap: baseUrl + "/sitemap.xml", host: baseUrl };
}
