import React from "react";
import Link from "next/link";
import { ShieldCheck, Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-surface-muted border-t border-border mt-16 text-text-secondary text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h4 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-3">
              About ZomatoFresh
            </h4>
            <ul className="space-y-2">
              <li><Link href="/" className="hover:text-brand transition-colors">Who We Are</Link></li>
              <li><Link href="/merchant" className="hover:text-brand transition-colors">Restaurant Partner Hub</Link></li>
              <li><Link href="/rider" className="hover:text-brand transition-colors">Delivery Fleet</Link></li>
              <li><Link href="/admin" className="hover:text-brand transition-colors">Operations Portal</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-3">
              Food Safety & Standards
            </h4>
            <div className="flex items-start gap-2 bg-white p-3 rounded-xl border border-border">
              <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-text-primary">FSSAI Certified</p>
                <p className="text-[11px] text-text-secondary">Lic. No. 10019011000123</p>
                <p className="text-[10px] text-text-secondary mt-1">100% hygienic partner kitchens</p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-3">
              For Restaurants
            </h4>
            <ul className="space-y-2">
              <li><Link href="/merchant" className="hover:text-brand transition-colors">Partner with Us</Link></li>
              <li><Link href="/merchant" className="hover:text-brand transition-colors">Kitchen Order App</Link></li>
              <li><Link href="/merchant" className="hover:text-brand transition-colors">Menu Management</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-3">
              Need Help?
            </h4>
            <p className="text-text-primary font-medium mb-1">Customer Support (24x7)</p>
            <p className="text-brand font-bold text-sm mb-2">+91 11 4567 8900</p>
            <p className="text-[11px]">support@zomatofresh.local</p>
          </div>
        </div>

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 ZomatoFresh Platform. Built strictly as per plan.md specifications.</p>
          <div className="flex items-center gap-1 text-[11px]">
            <span>Crafted with</span>
            <Heart className="w-3.5 h-3.5 text-brand fill-brand" />
            <span>for authentic Indian food delivery</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
