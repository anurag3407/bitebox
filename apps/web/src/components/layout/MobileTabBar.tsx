"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, Receipt, Search, User, UtensilsCrossed } from "lucide-react";
import { useI18n } from "@/features/i18n/use-i18n";

const TABS = [
  { href: "/", labelKey: "nav.home" as const, icon: Home, match: (p: string) => p === "/" || p.startsWith("/restaurants") },
  { href: "/dining", labelKey: "nav.dining" as const, icon: UtensilsCrossed, match: (p: string) => p.startsWith("/dining") },
  { href: "/search", labelKey: "nav.search" as const, icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/account?tab=orders", labelKey: "nav.orders" as const, icon: Receipt, match: (p: string, tab: string | null) => p.startsWith("/orders") || (p === "/account" && (tab ?? "orders") === "orders") },
  { href: "/account?tab=profile", labelKey: "nav.account" as const, icon: User, match: (p: string, tab: string | null) => (p === "/account" && !!tab && tab !== "orders") || p.startsWith("/support") },
];

function TabBar({ tab }: { tab: string | null }) {
  const { t } = useI18n();
  const pathname = usePathname();
  if (pathname.startsWith("/checkout") || pathname.startsWith("/cart")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-white/95 pb-safe backdrop-blur-xl sm:hidden" aria-label="Main">
      <ul className="grid h-16 grid-cols-5">
        {TABS.map((item) => {
          const active = item.match(pathname, tab);
          return (
            <li key={item.labelKey}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${active ? "text-ink" : "text-ink-muted"}`}
              >
                <item.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TabBarWithParams() {
  return <TabBar tab={useSearchParams().get("tab")} />;
}

/** App-style bottom navigation for phones / installed PWA. Hidden in checkout, which is a focused flow. */
export function MobileTabBar() {
  return (
    <Suspense fallback={<TabBar tab={null} />}>
      <TabBarWithParams />
    </Suspense>
  );
}
