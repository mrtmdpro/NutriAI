import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the public surface (no Supabase required).
 *
 * These run against `npm run dev` with no auth and verify the
 * core navigation + bilingual rendering. Auth-gated flows live in a
 * separate suite that requires a seeded Supabase project.
 */

test("home redirects to /vi by default", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  await expect(page).toHaveURL(/\/vi(\/?$|\?)/);
  await expect(
    page.getByRole("heading", { level: 1 }).first()
  ).toBeVisible();
});

test("locale switcher navigates between vi and en", async ({ page }) => {
  await page.goto("/vi");
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  // English headline shows up on the home page.
  await expect(page.getByText(/Make safe/i)).toBeVisible();
});

test("dashboard requires auth", async ({ page }) => {
  await page.goto("/vi/dashboard");
  await expect(page).toHaveURL(/\/vi\/login/);
});

test("search page renders empty state when DB unconfigured", async ({
  page,
}) => {
  await page.goto("/vi/search");
  await expect(page.getByRole("search")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /tìm kiếm bằng chứng/i })
  ).toBeVisible();
});

test("pricing page renders both tiers", async ({ page }) => {
  await page.goto("/vi/pricing");
  await expect(page.getByText("NutriAI Pro")).toBeVisible();
  await expect(page.getByText("199")).toBeVisible();
});

test("quality index renders empty-state cleanly", async ({ page }) => {
  await page.goto("/en/quality-index");
  await expect(
    page.getByRole("heading", { level: 1, name: /quality index/i })
  ).toBeVisible();
});

test("404 surface is bilingual", async ({ page }) => {
  await page.goto("/vi/this-route-does-not-exist");
  await expect(page.getByText("404")).toBeVisible();
});
