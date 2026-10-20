import React from "react";
import Link from "next/link";

const COLUMNS: Array<{ title: string; links: Array<[string, string]> }> = [
  { title: "ZomatoFresh", links: [["Restaurants near you", "/"], ["Search", "/search"], ["Your orders", "/account?tab=orders"], ["Help & support", "/support"]] },
  { title: "For partners", links: [["Add your restaurant", "/partner?type=restaurant"], ["Deliver with us", "/partner?type=rider"], ["Restaurant console", "/merchant"], ["Delivery partner app", "/rider"]] },
  { title: "Legal", links: [["Terms of service", "/legal/terms"], ["Privacy policy", "/legal/privacy"], ["Cancellation & refunds", "/legal/refunds"], ["Grievance redressal", "/legal/grievance"]] },
];

export function Footer() {
  return (
    <footer className="bg-surface-muted border-t border-border mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2 md:col-span-1">
          <p className="text-xl font-black">
            Zomato<span className="text-brand">Fresh</span>
          </p>
          <p className="text-xs text-text-secondary mt-2">Food from restaurants near you, delivered fast with live tracking.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">{col.title}</h3>
            <ul className="space-y-2">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-brand">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-center text-[11px] text-text-secondary pb-6">Prices include GST where applicable. Restaurant partners are responsible for food quality and FSSAI compliance.</p>
    </footer>
  );
}
