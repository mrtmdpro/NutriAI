import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const PUBLIC_PATHS = [
  "",
  "/search",
  "/quality-index",
  "/feed",
  "/pricing",
  "/login",
  "/register",
] as const;

/**
 * Public sitemap. We list each public page once per locale, with
 * `alternates.languages` pointing at every other locale so search
 * engines understand the multilingual relationship.
 *
 * Authenticated routes (/dashboard, /account, /chat) are intentionally
 * omitted; they're personal, not crawlable, and surfacing them confuses
 * SEO with login redirects.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://nutriai.app";

  return PUBLIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((alt) => [alt, `${base}/${alt}${path}`])
        ),
      },
    }))
  );
}
