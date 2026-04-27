"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveSubscription } from "@/lib/push/actions";

function detectPushSupport(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window;
}

export function PushToggle({
  publicKey,
}: Readonly<{ publicKey: string | null }>) {
  const t = useTranslations("Regimen");
  // Lazy initializer: compute support synchronously on first render.
  // Server-render returns false (no window) and the client will
  // re-evaluate on mount; this avoids a setState-in-effect cascade.
  const [supported] = useState<boolean>(detectPushSupport);
  const [enabled, setEnabled] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setEnabled(!!sub);
      })
      .catch(() => {
        /* ignore — leave enabled=false */
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  if (!supported || !publicKey) {
    // Hide the affordance when push is unsupported (e.g. iOS Safari < 16.4
    // standalone-only, or a desktop browser blocking notifications) or
    // VAPID isn't configured. The user still gets email reminders.
    return null;
  }

  function onClick() {
    if (!publicKey) return;
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast.error(t("pushBlocked"));
          return;
        }
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const json = subscription.toJSON();
        const result = await saveSubscription({
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent,
        });
        if (!result.ok) {
          toast.error(t("saveFailed"));
          return;
        }
        setEnabled(true);
        toast.success(t("pushEnabled"));
      } catch (err) {
        console.error(err);
        toast.error(t("pushBlocked"));
      }
    });
  }

  return (
    <Button
      type="button"
      variant={enabled ? "secondary" : "outline"}
      size="sm"
      onClick={onClick}
      disabled={isPending || enabled}
    >
      {enabled ? (
        <Bell className="size-4" aria-hidden />
      ) : (
        <BellOff className="size-4" aria-hidden />
      )}
      {enabled ? t("pushEnabled") : t("enablePush")}
    </Button>
  );
}

/**
 * Decode a URL-safe base64 string into a `BufferSource` suitable for
 * `applicationServerKey`. We allocate a fresh ArrayBuffer so the return
 * type satisfies TS lib.dom's `Uint8Array<ArrayBuffer>` constraint.
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buffer;
}
