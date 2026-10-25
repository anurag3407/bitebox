"use client";

import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@startup/api-client";
import { AuthProvider } from "@/features/auth/auth-context";
import { ToastProvider } from "@/components/ui/toast";
import { rehydrateClientStores } from "@/features/hydration";
import { ServiceWorkerManager } from "@/features/pwa/service-worker";
import { NetworkStatusBanner } from "@/features/pwa/network-status";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Never retry client errors (401/403/404/422); retry flaky networks/5xx twice
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
            refetchOnWindowFocus: true,
          },
        },
      })
  );

  useEffect(() => rehydrateClientStores(), []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <NetworkStatusBanner />
          {children}
          <ServiceWorkerManager />
        </ToastProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
