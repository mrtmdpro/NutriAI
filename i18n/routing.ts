import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["vi", "en"] as const,
  defaultLocale: "vi",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
