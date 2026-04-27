/**
 * Browser-chrome theme colors. These are the *only* hex literals
 * permitted in the codebase. They mirror the OKLCH `--background`
 * tokens defined in app/globals.css and exist solely because the
 * Next.js `viewport.themeColor` API can't read CSS variables.
 *
 * Keep this file in lock-step with `:root` and `.dark` in
 * app/globals.css. If you change a token there, change it here.
 */
export const THEME_COLORS = {
  // mirrors --background in :root → oklch(1 0 0)
  light: "#ffffff",
  // mirrors --background in .dark → oklch(0.16 0.02 152)
  dark: "#0c1f15",
} as const;
