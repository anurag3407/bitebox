"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, Receipt, Search, User } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" || p.startsWith("/restaurants") },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/account?tab=orders", label: "Orders", icon: Receipt, match: (p: string, tab: string | null) => p.startsWith("/orders") || (p === "/account" && (tab ?? "orders") === "orders") },
  { href: "/account?tab=profile", label: "Account", icon: User, match: (p: string, tab: string | null) => (p === "/account" && !!tab && tab !== "orders") || p.startsWith("/support") },
];

function TabBar({ tab }: { tab: string | null }) {
  const pathname = usePathname();
  if (pathname.startsWith("/checkout")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-white/95 pb-safe backdrop-blur-xl sm:hidden" aria-label="Main">
      <ul className="grid h-16 grid-cols-4">
        {TABS.map((t) => {
          const active = t.match(pathname, tab);
          return (
            <li key={t.label}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${active ? "text-ink" : "text-ink-muted"}`}
              >
                <t.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                {t.label}
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
