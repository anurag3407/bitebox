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
    let updateTimer: ReturnType<typeof setInterval> | undefined;
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
        updateTimer = setInterval(() => registration.update().catch(() => undefined), 30 * 60 * 1000);
      })
      .catch(() => undefined);

    return () => {
      clearInterval(updateTimer);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting) return null;
  return (
    <div role="status" className="fixed left-1/2 top-[calc(1rem+env(safe-area-inset-top))] z-[60] flex -translate-x-1/2 animate-toast-in items-center gap-4 rounded-full bg-ink py-2 pl-5 pr-2 text-sm text-white shadow-pop">
      <span>A new version is ready</span>
      <button onClick={() => waiting.postMessage("SKIP_WAITING")} className="btn btn-sm gap-1.5 bg-white text-ink hover:bg-white/90">
        <RefreshCw className="h-3.5 w-3.5" /> Refresh
      </button>
    </div>
  );
}
