"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa_install_dismissed_at";
const DISMISS_DAYS = 14;

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** "Add to home screen" banner: native prompt on Android/desktop, instructions on iOS Safari. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)) {
      const t = setTimeout(() => setShowIos(true), 20_000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onPrompt);
      };
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // storage unavailable (private mode)
    }
    setDeferred(null);
    setShowIos(false);
  };

  if (!deferred && !showIos) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:w-96 z-[55] bg-white border border-border rounded-2xl shadow-2xl p-4 flex items-start gap-3">
      <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-text-primary">Get the ZomatoFresh app</p>
        {deferred ? (
          <p className="text-xs text-text-secondary mt-0.5">Faster ordering, live tracking and order alerts. No app store needed.</p>
        ) : (
          <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1 flex-wrap">
            Tap <Share className="w-3.5 h-3.5 inline" /> then <b>Add to Home Screen</b>.
          </p>
        )}
        {deferred && (
          <button
            onClick={async () => {
              await deferred.prompt();
              await deferred.userChoice.catch(() => undefined);
              dismiss();
            }}
            className="mt-2 inline-flex items-center gap-1.5 bg-brand text-white text-xs font-bold px-3 py-1.5 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" /> Install
          </button>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="p-1 text-text-secondary hover:text-text-primary">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
