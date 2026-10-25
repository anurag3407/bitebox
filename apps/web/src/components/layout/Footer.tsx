import React from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const COLUMNS: Array<{ title: string; links: Array<[string, string]> }> = [
  { title: "Order", links: [["Restaurants near you", "/"], ["Search", "/search"], ["Your orders", "/account?tab=orders"], ["Help", "/support"]] },
  { title: "Partners", links: [["Add your restaurant", "/partner?type=restaurant"], ["Deliver with us", "/partner?type=rider"], ["Restaurant console", "/merchant"], ["Delivery partner app", "/rider"]] },
  { title: "Legal", links: [["Terms", "/legal/terms"], ["Privacy", "/legal/privacy"], ["Cancellations & refunds", "/legal/refunds"], ["Grievance redressal", "/legal/grievance"]] },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="page grid grid-cols-2 gap-10 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">Good food from restaurants near you, delivered fast and priced honestly.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-medium text-ink">{col.title}</h3>
            <ul className="mt-4 space-y-3">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-ink-muted transition-colors hover:text-ink">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="page border-t border-line py-6">
        <p className="text-xs text-ink-muted">Prices include GST where applicable. Restaurant partners are responsible for food quality and FSSAI compliance.</p>
      </div>
    </footer>
  );
}
