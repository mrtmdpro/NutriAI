/**
 * Stitch design generation pipeline.
 *
 * Reads STITCH_API_KEY from env, creates (or reuses) a "NutriAI" project,
 * generates a screen for each entry in SCREEN_PROMPTS, downloads the HTML
 * and screenshot, and writes them to design/stitch/<slug>.{html,png}.
 *
 * Run with:
 *   npm run stitch:generate
 *
 * Free tier is capped at 350 generations / month — reuse outputs by checking
 * design/stitch into git and only re-running when prompts change.
 *
 * The full brand brief and the prompt inventory live at
 * docs/brand-brief.md. Keep that file in sync with this one.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Stitch, StitchToolClient, StitchError } from "@google/stitch-sdk";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "design", "stitch");
const PROJECT_REF_FILE = join(OUT_DIR, "_project.json");

type Prompt = {
  slug: string;
  device: "MOBILE" | "DESKTOP" | "TABLET" | "AGNOSTIC";
  prompt: string;
};

/**
 * Brand prefix attached to every Stitch prompt. Mirror of the
 * "Color" + "Typography" + "Voice" sections of docs/brand-brief.md;
 * keep them in sync.
 *
 * Note: hex literals here are shown only to the design LLM. The
 * canonical color is `oklch(0.72 0.16 152)` in app/globals.css.
 */
const BRAND_PREFIX = [
  "Mobile-first nutrition app called NutriAI for Vietnamese consumers (default Vietnamese, English secondary).",
  "Single-hue light-green palette at hue 152: primary mint oklch(0.72 0.16 152) ~#86EFAC, deep foreground oklch(0.18 0.02 152) ~#0c1f15, accent wash oklch(0.94 0.05 152) ~#D5F0DD. White surfaces.",
  "Geist Sans for UI; Geist Mono only for IDs, timestamps, payment codes.",
  "Voice: clinical-but-friendly, evidence-first, scientifically rigorous, never lifestyle-influencer or pharma-clinical.",
  "shadcn/ui primitives: rounded-xl cards, soft shadows, subtle borders, accessible hierarchy, tabular-nums for numeric data.",
  "All cards use design tokens — no gradients, no glassmorphism, no decorative photos of people. Charts use a sequential green ramp.",
  "Bilingual labels in Vietnamese first when natural, with English fallback.",
].join(" ");

const SCREEN_PROMPTS: Prompt[] = [
  // ─── Brand ─────────────────────────────────────────────────────────
  {
    slug: "00-logo-system",
    device: "DESKTOP",
    prompt:
      "Brand sheet for NutriAI. Lay out a 2x3 grid on a clean white canvas with a thin border. " +
      "The MARK is a single-color (primary mint green) leaf-shaped silhouette where the leaf's central vein resolves into a small circuit node at the tip — simultaneously suggesting nutrition (leaf) and reasoning (signal point). " +
      "Geometric, not illustrative. One ink, no gradients, no glow. Optical-balance for 16px favicon and 1200×630 hero. " +
      "DO NOT use: medical cross, pill bottle, mortar & pestle, DNA helix, flowers, ribbons, monogram in a circle. " +
      "Cells: " +
      "(1) Primary horizontal lockup: mark + wordmark 'NutriAI' in Geist Sans semibold, mark left, wordmark right, baseline-aligned. " +
      "(2) Stacked lockup: mark on top, 'NutriAI' centered below. " +
      "(3) Mark only at 64px on white. " +
      "(4) Wordmark only — 'NutriAI' with the 'AI' pair tracked slightly tighter and one weight lighter than 'Nutri' for subtle AI emphasis. No color shift. " +
      "(5) Reverse on green: full lockup in white on a primary-mint background tile. " +
      "(6) Favicon close-up at 32×32 — solid mint tile with a white 'N' in semibold. " +
      "Label each cell with a small monospace caption like 'horizontal', 'stacked', 'mark', 'wordmark', 'reverse', 'favicon'.",
  },

  // ─── Public BR1 — Knowledge Hub ────────────────────────────────────
  {
    slug: "01-landing",
    device: "MOBILE",
    prompt:
      "Landing page hero. Top: brand mark + wordmark, locale switcher (VN/EN), 'Đăng nhập' / 'Đăng ký' buttons. " +
      "Hero block: badge chip 'BR1 + BR2 + BR4', big balanced headline 'Lựa chọn thực phẩm bổ sung an toàn, dựa trên khoa học', subheadline, primary search bar with placeholder 'Tìm hoạt chất hoặc sản phẩm bổ sung...' and a primary 'Bắt đầu tra cứu' button + outline 'Xem các gói' button. " +
      "Below: 3 value-prop tiles (Cơ sở dữ liệu minh bạch / Theo dõi tuân thủ / Trợ lý AI có dẫn chứng) each with a small icon, title, body. " +
      "Below that: Quality Index preview — 3 ranked supplement cards in S/A/B tiers with scores and price-per-dose.",
  },
  {
    slug: "02-search-results",
    device: "MOBILE",
    prompt:
      "Search results page. Header sticky with the search bar pre-filled 'magnesium' and a 'Tìm' button. " +
      "Filter row: 'Bộ lọc' + chips: Tất cả / Vitamin / Khoáng chất / Axit amin / Chất béo / Protein. The 'Khoáng chất' chip is active. " +
      "Section heading 'Sản phẩm' followed by 6 supplement cards (3 columns desktop, 1 column mobile). Each card: brand subtitle, product name, light-green Quality Index tier badge (S/A/B/C with score), price-per-dose with vi-VN currency, and a small ArrowRight chevron. " +
      "Below: section heading 'Hoạt chất' with a 2-column grid of ingredient cards each showing name, an outline 'Khoáng chất' category badge, and a 2-line description.",
  },
  {
    slug: "03-search-empty",
    device: "MOBILE",
    prompt:
      "Same search header as the results page but empty body. " +
      "Centered card 'Cơ sở dữ liệu đang được nạp' with subtitle 'Cơ sở dữ liệu đang được nạp tự động hằng ngày từ NIH ODS, PubMed, OpenFDA. Vui lòng quay lại sau.' Generous vertical padding, subtle illustration of an empty rounded leaf glyph in mint.",
  },
  {
    slug: "04-supplement-detail-ingredients",
    device: "MOBILE",
    prompt:
      "Supplement detail page, INGREDIENTS tab active. " +
      "Header: '← Quay lại' link, brand subtitle ('bởi NOW Foods'), product title 'Magnesium Glycinate 200mg', three outline badges (Capsule / 90 viên / 4.500₫ mỗi liều), and a Quality Index pill 'A · 78' on the right. Description paragraph below. " +
      "Tabs row: Thành phần (active) / Bằng chứng / Chất lượng. " +
      "Tab content: clean table with 3 columns — Hoạt chất / Liều / % Nhu cầu hàng ngày. Five rows: Magnesium glycinate 200mg 50%, Vitamin B6 5mg 250%, etc. Each row's left cell shows ingredient name and a small category subtitle (Khoáng chất / Vitamin).",
  },
  {
    slug: "05-supplement-detail-evidence",
    device: "MOBILE",
    prompt:
      "Supplement detail page with the EVIDENCE tab active. Header shows product name 'Magnesium Glycinate 200mg' with small subtitle 'bởi NOW Foods', and a Quality Index pill 'A · 78' on the right. Tab row: Thành phần / Bằng chứng (active) / Chất lượng. " +
      "Body: stack of 3 evidence cards. Card 1: small filled mint letter badge 'A', small-caps source pill 'PUBMED', date '· Công bố: 15 thg 3, 2024', semibold title, 4-line summary, small mint 'Xem nguồn ↗' link. Card 2: outline 'B' badge, otherwise same shape. Card 3: outline 'C' badge.",
  },
  {
    slug: "06-supplement-detail-quality",
    device: "MOBILE",
    prompt:
      "Supplement detail page with the QUALITY tab active. Header shows product name 'Magnesium Glycinate 200mg' with subtitle 'bởi NOW Foods'. Tab row: Thành phần / Bằng chứng / Chất lượng (active). " +
      "Body: 3 score cards in a row. Card 1: label 'Kiểm nghiệm bên thứ ba', big number '32' with smaller '/ 40', mint progress bar. Card 2: 'Chất lượng thành phần', '24 / 30'. Card 3: 'Hiệu quả chi phí', '22 / 30'. " +
      "Below: wide summary card with 'Điểm tổng' on the left and a mint Quality Index tier badge 'A · 78' on the right, plus a one-line note.",
  },
  {
    slug: "07-quality-index",
    device: "MOBILE",
    prompt:
      "Independent Quality Index page. Header 'Chỉ số chất lượng độc lập' + subtitle 'Bảng xếp hạng các sản phẩm bổ sung dựa trên kiểm nghiệm bên thứ ba, độ tinh khiết và giá theo liều.' " +
      "Body: four tier sections (S — Xuất sắc, A — Rất tốt, B — Khá, C — Trung bình). Each section header has a tier pill with score, then a 2-column card grid. " +
      "Each card shows: brand subtitle, product name (truncated to 2 lines), a big score number on the right, and three thin score bars with labels (Lab / Ingredient / Price) each '32/40' on the right. " +
      "Tier S has 2 cards, A has 4, B has 4, C has 2.",
  },
  {
    slug: "08-feed",
    device: "MOBILE",
    prompt:
      "Curated content feed. Header 'Bảng tin' + subtitle 'Bài viết và video giáo dục được tuyển chọn, có dẫn nguồn.' " +
      "Body: optional 'Dành cho phác đồ của bạn' rail — horizontally scrolling 3 cards. " +
      "Below: 'Mới nhất' grid — 6 article cards. Mix of pure articles (no badge) and videos (small outline badge with Play icon and 'Video' label). Each card: optional 'bởi Quý Somsen' KOL byline, 2-line title, 3-line preview body, and a mint 'Xem video ↗' link only on video cards.",
  },

  // ─── Auth ──────────────────────────────────────────────────────────
  {
    slug: "09-login",
    device: "MOBILE",
    prompt:
      "Login screen. Centered card on a pale-mint full-screen background. " +
      "Card content: brand mark in a small mint tile at top, then 'Đăng nhập' headline + subtitle 'Tiếp tục theo dõi sức khoẻ của bạn cùng NutriAI.', " +
      "outline 'Tiếp tục với Google' button with the Google G logo, a 'hoặc' separator with thin lines, " +
      "Email + Mật khẩu inputs each with a label, primary 'Đăng nhập' button full-width, " +
      "a small footer 'Chưa có tài khoản? Đăng ký' with the link in mint.",
  },
  {
    slug: "10-register",
    device: "MOBILE",
    prompt:
      "Register screen. Centered card on a pale-mint background. " +
      "Card: small mint tile with brand mark, 'Tạo tài khoản' headline + subtitle 'Bắt đầu xây dựng phác đồ bổ sung dựa trên bằng chứng.' " +
      "Outline 'Tiếp tục với Google' button with the Google G logo, 'hoặc' separator, " +
      "Email + Mật khẩu inputs with labels and a 'Tối thiểu 8 ký tự' helper text under the password, " +
      "primary 'Tạo tài khoản' button full-width, " +
      "footer 'Đã có tài khoản? Đăng nhập' with the link in mint.",
  },

  // ─── BR2 — Adherence ───────────────────────────────────────────────
  {
    slug: "11-dashboard-today",
    device: "MOBILE",
    prompt:
      "Adherence dashboard, mobile. Top: 'Hôm nay của bạn' headline + subtitle 'Phác đồ hôm nay. Chạm để đánh dấu đã uống.' " +
      "Above the regimen list: 3 stat cards — '5 ngày liên tiếp 🔥', '92% Tuân thủ tuần', '87% Tuân thủ tháng'. " +
      "Below: a list of 5 supplement intake cards ordered by time. Each card: outline time badge (08:00, 12:00, 19:00, 22:00, 22:00), small regimen-name subtitle, supplement name with dose suffix, optional mint link to the supplement page, and a right-aligned 'Đã uống' or 'Hoàn tác' button. The first 3 entries are toggled on (secondary variant with a Check icon). " +
      "Top-right header buttons: 'Phác đồ' outline + 'Phân tích' ghost.",
  },
  {
    slug: "12-dashboard-empty",
    device: "MOBILE",
    prompt:
      "Adherence dashboard, first-time empty state. " +
      "Top: 'Hôm nay của bạn' headline + subtitle 'Phác đồ hôm nay. Chạm để đánh dấu đã uống.' " +
      "Stat row: three muted cards showing '0 ngày liên tiếp', '0% Tuân thủ tuần', '0% Tuân thủ tháng'. " +
      "Body: single centered card with 'Bạn chưa có phác đồ nào.' subtitle and a primary 'Tạo phác đồ đầu tiên' button with a Plus icon.",
  },
  {
    slug: "13-regimen-list",
    device: "MOBILE",
    prompt:
      "Regimens list page. Top: headline 'Phác đồ của bạn', primary '+ Phác đồ mới' button on the right. " +
      "Body: two cards. First card title 'Hằng ngày', subtitle 'Asia/Ho_Chi_Minh', Pencil edit button on the right, item rows 'Vitamin D3 5000 IU' and 'Magnesium 200 mg' each with an outline time badge on the right. Second card title 'Cuối tuần', one row 'Omega-3 EPA 1000 mg' with an outline 12:00 badge.",
  },
  {
    slug: "14-regimen-builder",
    device: "MOBILE",
    prompt:
      "Regimen builder page. Top: '← Quay lại' link, headline 'Phác đồ mới', and a secondary 'Bật thông báo' button on the right with a Bell icon. " +
      "First card: regimen name input ('Hằng ngày') and timezone input ('Asia/Ho_Chi_Minh'). " +
      "Then header 'Các hoạt chất' with a '+ Thêm hoạt chất' outline button on the right. " +
      "Two item cards. Each item: " +
      "row of inputs — Hoạt chất / Liều / Đơn vị — and a Trash icon button. " +
      "'Giờ nhắc' chip row with 4 preset buttons (Sáng 08:00, Trưa 12:00, Tối 19:00, Trước ngủ 22:00); the first and third are active (secondary). " +
      "'Ngày trong tuần' chip row with 7 day buttons (T2..T7, CN), all active. " +
      "Two switches at bottom: 'Thông báo trên trình duyệt' (on) and 'Email nhắc' (off). " +
      "A primary 'Lưu phác đồ' button at the bottom.",
  },
  {
    slug: "15-analytics",
    device: "MOBILE",
    prompt:
      "Analytics page. Top: '← Quay lại', headline 'Phân tích tuân thủ' + subtitle. " +
      "3 big-stat cards in a row: 'Chuỗi hiện tại 5 🔥', '87% Tỷ lệ 30 ngày', '92% Tỷ lệ tuần'. " +
      "Card titled 'Xu hướng theo tuần' containing a smooth mint line chart showing 12 weekly data points around 70-95% with mint dots. " +
      "Card titled 'Bản đồ 12 tuần' containing a 7-row × 12-column heatmap grid of small rounded tiles, mint-shaded by adherence rate. Days labeled Mon/Tue/Wed/Thu/Fri/Sat/Sun on the left axis, no x-axis labels. Mostly bright, with sparser muted tiles in the older weeks.",
  },

  // ─── BR4 — RAG chat ────────────────────────────────────────────────
  {
    slug: "16-chat-empty",
    device: "MOBILE",
    prompt:
      "Chat empty state. Sticky thin top bar: brand mark + 'Trợ lý NutriAI' title + outline pill 'Miễn phí · 10 tin/ngày' on the right. " +
      "Body: a single welcome card with a Sparkles icon and headline 'Hỏi gì cũng được, miễn có dẫn nguồn' + subtitle. " +
      "Below the headline: 3 suggested-prompt buttons stacked vertically, each a left-aligned mint-wash button — 'Vitamin D3 nên uống lúc nào trong ngày?', 'Magie có tương tác với calcium không?', 'Omega-3 EPA và DHA khác nhau ra sao?'. " +
      "Sticky composer at the bottom: text input 'Hỏi về thực phẩm bổ sung của bạn...' + circular Send button.",
  },
  {
    slug: "17-chat-conversation",
    device: "MOBILE",
    prompt:
      "Chat page with one full Q&A turn. " +
      "Sticky thin top bar: brand mark + 'Trợ lý NutriAI' + outline pill 'Miễn phí · 10 tin/ngày'. " +
      "Conversation area: " +
      "User bubble right-aligned, primary mint fill, white text: 'Vitamin D3 nên uống lúc nào trong ngày?'. " +
      "Assistant bubble left-aligned, white card with subtle border. Three short Vietnamese paragraphs; each paragraph ends with a tiny mint underlined superscript citation like [c1] or [c2]. " +
      "Below the assistant text, a row of three citation chips. Each chip is a small rounded pill with an outline letter badge (c1, c2, c3) and a truncated source title plus an ExternalLink icon. " +
      "Sticky composer at the bottom: text input 'Hỏi về thực phẩm bổ sung của bạn...' and a circular Send button.",
  },

  // ─── Monetization ──────────────────────────────────────────────────
  {
    slug: "18-pricing",
    device: "MOBILE",
    prompt:
      "Pricing page. Centered headline 'Bảng giá NutriAI' + subtitle 'Hỗ trợ NutriAI để mở khoá toàn bộ tính năng nâng cao.' " +
      "Two cards in a 2-column responsive grid. " +
      "FREE card: title 'Miễn phí', subtitle, big '0₫ / tháng', then a checkmark feature list (Tìm kiếm cơ sở dữ liệu khoa học, Chỉ số chất lượng độc lập, Bảng tin được tuyển chọn, Theo dõi tuân thủ + nhắc nhở, Trợ lý AI · 10 tin/ngày, Phân tích cơ bản). 'Gói hiện tại' badge in the header. No CTA. " +
      "PRO card: highlight border in mint with a soft mint ring; title 'NutriAI Pro', subtitle, big '199.000 ₫ / tháng', secondary line '1.990.000 ₫ / năm · Tiết kiệm 17%'. Same checkmark list but with 'không giới hạn' for AI and 'Phân tích chuyên sâu + xuất dữ liệu' + 'Hỗ trợ ưu tiên'. Primary 'Nâng cấp' button full-width. Tiny footnote 'Thanh toán qua chuyển khoản · SePay.vn'.",
  },
  {
    slug: "19-billing-pending",
    device: "MOBILE",
    prompt:
      "Account billing page in PENDING state. Top: '← Quay lại', headline 'Tài khoản & Thanh toán' + subtitle. " +
      "Current-plan card: 'Gói hiện tại' header + outline 'Miễn phí' badge on the right. " +
      "Pending card with a mint border and a 'Tháng' badge in the top-right: heading 'Đang chờ thanh toán', subtitle. " +
      "Inside, two columns: " +
      "(left) a centered VietQR code in a small framed box at ~200×200, " +
      "(right) labeled fields — 'Số tiền: 199.000 ₫', then 'Mã ghi chú' shown as a monospace pill 'NUTRI...XYZ' next to a Copy button. " +
      "Below: a status row with a small spinning RotateCw icon + 'Đang chờ thanh toán' on the left, and a tiny ghost 'Huỷ giao dịch chờ' button on the right. " +
      "Bottom: 'Lịch sử giao dịch' table card with one row showing the pending entry.",
  },
  {
    slug: "20-billing-active",
    device: "MOBILE",
    prompt:
      "Account billing page in ACTIVE state. Same header as 19. " +
      "Current-plan card: 'Gói hiện tại' + small subtitle 'Hết hạn vào 15 thg 5, 2026', and a secondary 'NutriAI Pro' badge on the right. No pending card. " +
      "Below: 'Lịch sử giao dịch' table with 3 rows. Columns: Số tiền (with subtitle 'Tháng' / 'Năm'), Mã ghi chú (monospace), and a status badge on the right ('Đã thanh toán' secondary, 'Đã huỷ' outline).",
  },

  // ─── System ────────────────────────────────────────────────────────
  {
    slug: "21-mobile-nav",
    device: "MOBILE",
    prompt:
      "Mobile navigation Sheet (left side drawer). The page behind is dimmed. " +
      "Sheet header: brand mark + 'NutriAI' wordmark, separator. " +
      "Body: stacked nav links — Bảng điều khiển (only when authed, mint-tinted), Tìm kiếm, Chỉ số chất lượng, Bảng tin, Trợ lý AI, Bảng giá. " +
      "Below: when logged-out, two stacked buttons — outline 'Đăng nhập' + primary 'Đăng ký'. " +
      "Each link is a rounded-md row with hover-accent background. The X close button at top-right of the sheet.",
  },
  {
    slug: "22-not-found",
    device: "MOBILE",
    prompt:
      "404 not-found inside the app shell (full top nav and footer visible). " +
      "Centered card: big '404' display number, subtitle 'Đã xảy ra lỗi', and a primary 'Quay lại' button linking back to the home page. " +
      "Use generous vertical padding; the card max-width 640.",
  },
];

async function main() {
  const apiKey = process.env.STITCH_API_KEY;
  if (!apiKey) {
    console.error(
      "STITCH_API_KEY is not set. Add it to .env (or your shell env) and try again."
    );
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const client = new StitchToolClient({ apiKey });
  const sdk = new Stitch(client);

  let projectId: string;
  if (existsSync(PROJECT_REF_FILE)) {
    const ref = JSON.parse(readFileSync(PROJECT_REF_FILE, "utf8")) as {
      projectId?: string;
    };
    if (!ref.projectId) {
      throw new Error(
        `${PROJECT_REF_FILE} is missing 'projectId'. Delete it to recreate.`
      );
    }
    projectId = ref.projectId;
    console.log(`Reusing project ${projectId}`);
  } else {
    console.log("Creating Stitch project 'NutriAI'...");
    const created = await sdk.createProject("NutriAI");
    projectId = created.projectId;
    writeFileSync(
      PROJECT_REF_FILE,
      JSON.stringify({ projectId }, null, 2),
      "utf8"
    );
    console.log(`Created project ${projectId}`);
  }

  const project = sdk.project(projectId);

  for (const { slug, prompt, device } of SCREEN_PROMPTS) {
    const outHtml = join(OUT_DIR, `${slug}.html`);
    const outImg = join(OUT_DIR, `${slug}.png`);
    if (existsSync(outHtml) && existsSync(outImg)) {
      console.log(`✓ ${slug} (cached)`);
      continue;
    }

    const fullPrompt = `${BRAND_PREFIX}\n\n${prompt}`;
    try {
      console.log(`→ Generating ${slug}...`);
      const screen = await project.generate(fullPrompt, device);
      const [htmlUrl, imageUrl] = await Promise.all([
        screen.getHtml(),
        screen.getImage(),
      ]);

      const [htmlRes, imgRes] = await Promise.all([
        fetch(htmlUrl),
        fetch(imageUrl),
      ]);
      if (!htmlRes.ok || !imgRes.ok) {
        throw new Error(
          `Download failed (html=${htmlRes.status}, img=${imgRes.status})`
        );
      }

      // Buffer both responses BEFORE writing either, so a partial failure
      // doesn't leave one file on disk and force a re-generation
      // (which would burn one of the 350/month free generations).
      const [htmlText, imgBuf] = await Promise.all([
        htmlRes.text(),
        imgRes.arrayBuffer().then((b) => Buffer.from(b)),
      ]);
      mkdirSync(dirname(outHtml), { recursive: true });
      writeFileSync(outHtml, htmlText, "utf8");
      writeFileSync(outImg, imgBuf);
      console.log(`✓ ${slug} (saved)`);
    } catch (err) {
      if (err instanceof StitchError) {
        console.error(`✗ ${slug}: ${err.code} — ${err.message}`);
      } else {
        console.error(`✗ ${slug}: ${(err as Error).message}`);
      }
    }
  }

  await client.close();
  console.log(`Done. Outputs in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
