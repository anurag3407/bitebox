"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Receipt, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/features/cart/cart-store";

const TABS = [
  { href: "/", label: "Delivery", icon: Home, match: (p: string) => p === "/" || p.startsWith("/restaurants") },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/account?tab=orders", label: "Orders", icon: Receipt, match: (p: string) => p.startsWith("/account") || p.startsWith("/orders") },
  { href: "/checkout", label: "Cart", icon: ShoppingBag, match: (p: string) => p.startsWith("/checkout") },
];

/** App-style bottom navigation for phones / installed PWA. */
export function MobileTabBar() {
  const pathname = usePathname();
  const count = useCartStore((s) => s.getItemCount());
  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-border pb-[env(safe-area-inset-bottom)]" aria-label="Main">
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href}>
              <Link href={t.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? "text-brand" : "text-text-secondary"}`}>
                <span className="relative">
                  <t.icon className="w-5 h-5" />
                  {t.label === "Cart" && count > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-brand text-white text-[9px] font-black rounded-full px-1">{count}</span>
                  )}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
