import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

/**
 * Known ingredient categories. Anything else falls back to "unknown".
 * Keep in lock-step with `messages/{vi,en}.json → Search.categories`.
 */
export const KNOWN_CATEGORIES = [
  "vitamin",
  "mineral",
  "amino acid",
  "fat",
  "protein",
  "fiber",
  "other",
  "unknown",
] as const;

export type KnownCategory = (typeof KNOWN_CATEGORIES)[number];

function normalize(input: string | null | undefined): KnownCategory {
  if (!input) return "unknown";
  return (KNOWN_CATEGORIES as readonly string[]).includes(input)
    ? (input as KnownCategory)
    : "unknown";
}

/**
 * Server Component variant. Returns a function that translates a raw
 * `ingredients.category` value to the active locale.
 */
export async function getCategoryLabel() {
  const t = await getTranslations("Search.categories");
  return (raw: string | null | undefined) => t(normalize(raw));
}

/** Client Component variant. Same contract. */
export function useCategoryLabel() {
  const t = useTranslations("Search.categories");
  return (raw: string | null | undefined) => t(normalize(raw));
}
