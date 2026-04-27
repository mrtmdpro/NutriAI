import { setRequestLocale, getTranslations } from "next-intl/server";
import { Leaf } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { AppShell } from "@/components/app-shell";
import { ChatConversation } from "@/components/chat-conversation";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import { getUserPlan, CHAT_FREE_DAILY_LIMIT } from "@/lib/rag/rate-limit";
import { asLocale } from "@/lib/i18n/locale-text";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login?next=/chat", locale });
  }

  const plan = await getUserPlan(user!.id);
  const t = await getTranslations("Chat");

  const startSuggestions =
    locale === "vi"
      ? [
          "Vitamin D3 nên uống lúc nào trong ngày?",
          "Magie có tương tác với calcium không?",
          "Omega-3 EPA và DHA khác nhau ra sao?",
        ]
      : [
          "When should I take vitamin D3?",
          "Does magnesium interact with calcium?",
          "What's the difference between EPA and DHA?",
        ];

  return (
    <AppShell>
      <div className="bg-accent/30 border-border border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-md">
              <Leaf className="size-4" aria-hidden />
            </span>
            <h1 className="text-foreground text-base font-semibold tracking-tight">
              {t("title")}
            </h1>
          </div>
          <Badge variant={plan === "pro" ? "secondary" : "outline"}>
            {plan === "pro" ? t("planPro") : t("planFree", { limit: CHAT_FREE_DAILY_LIMIT })}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <ChatConversation
          locale={locale}
          placeholder={t("placeholder")}
          startSuggestions={startSuggestions}
        />
      </div>
    </AppShell>
  );
}
