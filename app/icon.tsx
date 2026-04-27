import { ImageResponse } from "next/og";
import { THEME_COLORS } from "@/lib/theme";

// 32x32 favicon. Light-green leaf glyph on a clean background. The
// only hex literals permitted in the codebase are mirrors of the OKLCH
// tokens (see lib/theme.ts) — primary green is reproduced inline here
// because @vercel/og can't read runtime CSS variables.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const PRIMARY_HEX = "#86EFAC"; // mirrors --primary in app/globals.css

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PRIMARY_HEX,
          borderRadius: 6,
          color: THEME_COLORS.light,
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        N
      </div>
    ),
    size
  );
}
