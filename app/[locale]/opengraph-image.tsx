import { ImageResponse } from "next/og";
import { routing } from "@/i18n/routing";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PRIMARY_HEX = "#86EFAC";
const FOREGROUND = "#0c1f15";

const HEADLINE: Record<string, string> = {
  vi: "Chọn thực phẩm bổ sung dựa trên bằng chứng",
  en: "Make safe, science-backed supplement decisions",
};

const TAGLINE: Record<string, string> = {
  vi: "NutriAI — Trí tuệ dinh dưỡng dựa trên bằng chứng",
  en: "NutriAI — Evidence-based nutritional intelligence",
};

export function generateImageMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const locale = (routing.locales as readonly string[]).includes(params.locale)
    ? params.locale
    : routing.defaultLocale;
  return [{ id: locale, alt: TAGLINE[locale] ?? TAGLINE.en, contentType, size }];
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales as readonly string[]).includes(rawLocale)
    ? rawLocale
    : routing.defaultLocale;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px 96px",
          background: "#FFFFFF",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: PRIMARY_HEX,
              color: FOREGROUND,
              fontSize: 36,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            N
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, color: FOREGROUND }}>
            NutriAI
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: FOREGROUND,
              lineHeight: 1.1,
              maxWidth: 880,
            }}
          >
            {HEADLINE[locale] ?? HEADLINE.en}
          </div>
          <div
            style={{
              fontSize: 26,
              color: "#1f4d33",
            }}
          >
            {TAGLINE[locale] ?? TAGLINE.en}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            fontSize: 18,
            color: "#1f4d33",
          }}
        >
          <span style={{ background: PRIMARY_HEX, padding: "6px 14px", borderRadius: 999 }}>
            BR1 Knowledge Hub
          </span>
          <span style={{ background: PRIMARY_HEX, padding: "6px 14px", borderRadius: 999 }}>
            BR2 Adherence
          </span>
          <span style={{ background: PRIMARY_HEX, padding: "6px 14px", borderRadius: 999 }}>
            BR4 Grounded AI
          </span>
        </div>
      </div>
    ),
    size
  );
}
