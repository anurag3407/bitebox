import React from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartBar } from "@/components/cart/CartBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { InstallPrompt } from "@/features/pwa/install-prompt";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="flex-1 pb-36 sm:pb-0">{children}</main>
      <CartBar />
      <div className="hidden sm:block">
        <Footer />
      </div>
      <MobileTabBar />
      <InstallPrompt />
    </div>
  );
}
