"use client";

import { useState } from "react";
import { Menu, Leaf } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavItem = { href: string; label: string };

export function MobileNav({
  menuLabel,
  brandName,
  items,
  isAuthed,
  loginLabel,
  registerLabel,
  dashboardLabel,
}: Readonly<{
  menuLabel: string;
  brandName: string;
  items: readonly NavItem[];
  isAuthed: boolean;
  loginLabel: string;
  registerLabel: string;
  dashboardLabel: string;
}>) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label={menuLabel}
        >
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-border border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-md">
              <Leaf className="size-4" aria-hidden />
            </span>
            {brandName}
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-3 py-4">
          {isAuthed && (
            <Link
              href="/dashboard"
              className="hover:bg-accent text-foreground rounded-md px-3 py-2 text-sm font-medium"
              onClick={() => setOpen(false)}
            >
              {dashboardLabel}
            </Link>
          )}
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:bg-accent text-foreground rounded-md px-3 py-2 text-sm"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          {!isAuthed && (
            <div className="mt-3 flex flex-col gap-2 px-1">
              <Button asChild variant="outline" onClick={() => setOpen(false)}>
                <Link href="/login">{loginLabel}</Link>
              </Button>
              <Button asChild onClick={() => setOpen(false)}>
                <Link href="/register">{registerLabel}</Link>
              </Button>
            </div>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
