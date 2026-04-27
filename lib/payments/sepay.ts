import "server-only";
import { nanoid } from "nanoid";
import { requireServerEnv } from "@/lib/env/server";

/** Pricing — kept here as the single source of truth. */
export const PRICING = {
  monthly: { vnd: 199_000, days: 31 },
  yearly: { vnd: 1_990_000, days: 366 },
} as const;

export type Period = keyof typeof PRICING;

/**
 * Generate a unique payment-code memo. Bank memos truncate aggressively
 * — we stay under 24 chars to be safe across all VN banks.
 *
 * Format: `NUTRI<userId8><nano8>` — 18 alphanumeric chars, no separators
 * which some banks strip.
 */
export function generatePaymentCode(userId: string): string {
  const userPart = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const random = nanoid(8).replace(/[^a-zA-Z0-9]/g, "X").toUpperCase();
  return `NUTRI${userPart}${random}`;
}

/**
 * Build a VietQR image URL via img.vietqr.io. The "compact" template
 * fits a phone screen and includes amount + memo overlaid on the QR.
 *
 * The recipient bank account, name, and short bank code come from env.
 */
export function buildVietQrImageUrl(input: {
  amountVnd: number;
  memo: string;
}): string {
  const account = requireServerEnv("SEPAY_BANK_ACCOUNT");
  const bank = requireServerEnv("SEPAY_BANK_NAME");
  const holder = requireServerEnv("SEPAY_ACCOUNT_HOLDER");

  const params = new URLSearchParams({
    amount: String(input.amountVnd),
    addInfo: input.memo,
    accountName: holder,
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(
    bank
  )}-${encodeURIComponent(account)}-compact2.png?${params.toString()}`;
}

export function getRecipient(): {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
} {
  return {
    bankName: requireServerEnv("SEPAY_BANK_NAME"),
    accountNumber: requireServerEnv("SEPAY_BANK_ACCOUNT"),
    accountHolder: requireServerEnv("SEPAY_ACCOUNT_HOLDER"),
  };
}

/** SePay webhook source IPs (from https://docs.sepay.vn/tich-hop-webhooks.html). */
export const SEPAY_IP_ALLOWLIST: readonly string[] = [
  "172.236.138.20",
  "172.233.83.68",
  "171.244.35.2",
  "151.158.108.68",
  "151.158.109.79",
  "103.255.238.139",
];
