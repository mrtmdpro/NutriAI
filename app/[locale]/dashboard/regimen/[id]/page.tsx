import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { redirect, Link } from "@/i18n/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { RegimenBuilder } from "@/components/regimen-builder";
import { PushToggle } from "@/components/push-toggle";
import { getCurrentUser } from "@/lib/auth";
import { listRegimens } from "@/lib/adherence/queries";
import { getPushPublicKey } from "@/lib/push/actions";
import { asLocale } from "@/lib/i18n/locale-text";

export default async function EditRegimenPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const user = await getCurrentUser();
  if (!user)
    redirect({ href: `/login?next=/dashboard/regimen/${id}`, locale });

  const regimens = await listRegimens({ locale });
  const regimen = regimens.find((r) => r.id === id);
  if (!regimen) notFound();

  const tCommon = await getTranslations("Common");
  const publicKey = await getPushPublicKey();

  return (
    <AppShell>
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-3">
          <Button asChild variant="ghost" size="xs" className="self-start">
            <Link href="/dashboard/regimen">← {tCommon("back")}</Link>
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              {regimen.name}
            </h1>
            <PushToggle publicKey={publicKey} />
          </div>
        </div>
        <RegimenBuilder
          defaultTimezone="Asia/Ho_Chi_Minh"
          initial={{
            id: regimen.id,
            name: regimen.name,
            timezone: regimen.timezone,
            items: regimen.items.map((item) => ({
              id: item.id,
              label: item.label,
              dose: item.dose,
              unit: item.unit,
              daysOfWeek: item.daysOfWeek,
              timesOfDay: item.timesOfDay,
              notifyPush: item.notifyPush,
              notifyEmail: item.notifyEmail,
            })),
          }}
        />
      </section>
    </AppShell>
  );
}
