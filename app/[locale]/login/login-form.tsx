"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import { signInWithPassword, signInWithGoogle } from "@/lib/auth/actions";
import { GoogleIcon } from "@/components/icons/google";

export function LoginForm({
  next,
  initialError,
}: Readonly<{
  next?: string;
  initialError?: boolean;
}>) {
  const t = useTranslations("Auth");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(
    initialError ? t("errorGeneric") : null
  );

  function onSubmit(formData: FormData) {
    setError(null);
    if (next) formData.set("next", next);
    startTransition(async () => {
      // The action throws NEXT_REDIRECT on success; we only see a return
      // value when something went wrong.
      const result = await signInWithPassword(formData);
      if (!result.ok) {
        setError(
          result.code === "invalid_credentials"
            ? t("errorInvalidCredentials")
            : t("errorGeneric")
        );
      }
    });
  }

  function onGoogle() {
    setError(null);
    startTransition(async () => {
      const result = await signInWithGoogle(next);
      if (!result.ok) {
        toast.error(t("errorGeneric"));
        return;
      }
      window.location.href = result.url;
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onGoogle}
        disabled={isPending}
        className="w-full"
      >
        <GoogleIcon className="size-4" />
        {t("googleContinue")}
      </Button>

      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <Separator className="flex-1" />
        <span>{t("or")}</span>
        <Separator className="flex-1" />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {t("submitLogin")}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        {t("noAccount")}{" "}
        <Link
          href={
            next
              ? `/register?next=${encodeURIComponent(next)}`
              : "/register"
          }
          className="text-primary font-medium hover:underline"
        >
          {t("registerCta")}
        </Link>
      </p>
    </form>
  );
}
