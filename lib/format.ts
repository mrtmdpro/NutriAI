import type { Locale } from "@/i18n/routing";

const LOCALE_TAG: Record<Locale, string> = {
  vi: "vi-VN",
  en: "en-US",
};

/**
 * Locale-aware Vietnamese đồng formatter. Uses CLDR grouping rules:
 *   vi-VN → "199.000 ₫"
 *   en-US → "₫199,000"
 *
 * `maximumFractionDigits: 0` because VND is not subdivided in
 * consumer-facing prices.
 */
export function formatVnd(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * ISO date or timestamp → locale-formatted "Mar 15, 2024" (en) or
 * "15 thg 3, 2024" (vi). Returns empty string on null / invalid input.
 */
export function formatDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
