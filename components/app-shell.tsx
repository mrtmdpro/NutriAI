import { getTranslations } from "next-intl/server";
import { Leaf } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MobileNav } from "@/components/mobile-nav";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "@/components/user-menu";

const NAV_ITEMS = [
  { href: "/search", key: "search" as const },
  { href: "/quality-index", key: "qualityIndex" as const },
  { href: "/feed", key: "feed" as const },
  { href: "/chat", key: "chat" as const },
  { href: "/pricing", key: "pricing" as const },
];

export async function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("Nav");
  const tBrand = await getTranslations("Brand");
  const user = await getCurrentUser();

  const navLabels: Record<(typeof NAV_ITEMS)[number]["key"], string> = {
    search: t("search"),
    qualityIndex: t("qualityIndex"),
    feed: t("feed"),
    chat: t("chat"),
    pricing: t("pricing"),
  };

  return (
    <>
      <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 border-border sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <MobileNav
              menuLabel={t("menu")}
              brandName={tBrand("name")}
              items={NAV_ITEMS.map((i) => ({
                href: i.href,
                label: navLabels[i.key],
              }))}
              isAuthed={!!user}
              loginLabel={t("login")}
              registerLabel={t("register")}
              dashboardLabel={t("dashboard")}
            />
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-md">
                <Leaf className="size-4" aria-hidden />
              </span>
              <span>{tBrand("name")}</span>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Button asChild key={item.href} variant="ghost" size="sm">
                <Link href={item.href}>{navLabels[item.key]}</Link>
              </Button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            {user ? (
              <UserMenu email={user.email ?? ""} />
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  <Link href="/login">{t("login")}</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">{t("register")}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs sm:flex-row">
          <span>
            © {new Date().getFullYear()} {tBrand("name")}
          </span>
          <span>{tBrand("tagline")}</span>
        </div>
      </footer>
    </>
  );
}
