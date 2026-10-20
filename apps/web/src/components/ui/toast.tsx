"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="fixed top-20 left-1/2 -translate-x-1/2 z-[80] flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium border ${
              t.kind === "error"
                ? "bg-red-50 text-red-800 border-red-200"
                : t.kind === "success"
                  ? "bg-success-light text-success border-success/30"
                  : "bg-white text-text-primary border-border"
            }`}
          >
            {t.kind === "error" ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> : t.kind === "success" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <Info className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
