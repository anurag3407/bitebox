"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Registers /sw.js (production builds, or when NEXT_PUBLIC_ENABLE_SW=true) and offers
 * a one-tap refresh when a new version has been deployed.
 */
export function ServiceWorkerManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW !== "true") return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
          });
        });
        // Long-lived tabs (riders, kitchens) still pick up deploys
        const timer = setInterval(() => registration.update().catch(() => undefined), 30 * 60 * 1000);
        return () => clearInterval(timer);
      })
      .catch(() => undefined);

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!waiting) return null;
  return (
    <div role="status" className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-text-primary text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
      <span>A new version is available</span>
      <button
        onClick={() => waiting.postMessage("SKIP_WAITING")}
        className="flex items-center gap-1 bg-white text-text-primary px-3 py-1.5 rounded-xl font-bold"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Refresh
      </button>
    </div>
  );
}
