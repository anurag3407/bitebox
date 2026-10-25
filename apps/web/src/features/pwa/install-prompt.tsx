"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

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
    <div className="fixed inset-x-4 top-[calc(5rem+env(safe-area-inset-top))] z-[55] flex animate-sheet-up items-center gap-4 rounded-3xl border border-line bg-white p-4 shadow-pop sm:inset-x-auto sm:bottom-8 sm:left-8 sm:top-auto sm:w-[380px]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft">
        <LogoMark className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Get the BiteBox app</p>
        {deferred ? (
          <p className="mt-0.5 text-xs text-ink-muted">Faster ordering and live alerts. No app store needed.</p>
        ) : (
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-muted">
            Tap <Share className="inline h-3.5 w-3.5" /> then <b className="font-medium text-ink">Add to Home Screen</b>
          </p>
        )}
      </div>
      {deferred && (
        <button
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice.catch(() => undefined);
            dismiss();
          }}
          className="btn btn-primary btn-sm"
        >
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="btn btn-ghost btn-icon -mr-1 h-8 w-8">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
