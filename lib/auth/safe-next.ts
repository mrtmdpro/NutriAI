import { routing } from "@/i18n/routing";

/**
 * Validate a same-origin redirect path. We only honor strings that:
 *   - start with `/`
 *   - aren't protocol-relative (`//host`, which the URL constructor
 *     interprets as cross-origin)
 *   - aren't backslash-prefixed (`/\\foo`), which some browsers parse
 *     the same way
 *
 * For anything else, we return the locale-prefixed default (`/<locale>/dashboard`).
 *
 * Centralized here so the server action, the OAuth callback, and the
 * proxy all agree on the rule.
 */
export function safeNext(input: unknown, locale: string): string {
  const fallback = `/${locale}/dashboard`;
  if (typeof input !== "string") return fallback;
  if (!input.startsWith("/")) return fallback;
  if (input.startsWith("//") || input.startsWith("/\\")) return fallback;
  return input;
}

export function isKnownLocale(value: string): boolean {
  return (routing.locales as readonly string[]).includes(value);
}
