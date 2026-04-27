import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Pick the correct bilingual field from a row, with graceful fallback.
 *
 * Bilingual rows in the Knowledge Hub follow the convention `<key>_vn`
 * + `<key>_en`. Either side may be null at any point in the ETL
 * lifecycle, so we never assume both exist. If neither side has a
 * value, we return an empty string.
 */
export function pickLocale<
  K extends string,
  Row extends { [P in `${K}_vn` | `${K}_en`]?: string | null }
>(row: Row, key: K, locale: Locale): string {
  const primary =
    locale === "vi"
      ? row[`${key}_vn` as `${K}_vn`]
      : row[`${key}_en` as `${K}_en`];
  const secondary =
    locale === "vi"
      ? row[`${key}_en` as `${K}_en`]
      : row[`${key}_vn` as `${K}_vn`];
  return primary ?? secondary ?? "";
}

/**
 * Narrow an arbitrary string from URL params into a known Locale, falling
 * back to the default locale if the value isn't one we ship for. The
 * proxy/intl middleware should have already normalized this — this is a
 * type-level guard for downstream code so we never carry a `string` that
 * could blow past the bilingual fallback.
 */
export function asLocale(value: string): Locale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}
