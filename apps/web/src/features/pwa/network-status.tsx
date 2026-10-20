"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function NetworkStatusBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-[70] bg-text-primary text-white text-xs font-semibold py-2 px-4 flex items-center justify-center gap-2">
      <WifiOff className="w-3.5 h-3.5" /> You are offline. Showing saved data where possible.
    </div>
  );
}
