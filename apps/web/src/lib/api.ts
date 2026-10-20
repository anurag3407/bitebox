"use client";

import { useMemo } from "react";
import { ApiClient, ApiError } from "@startup/api-client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-context";

export function useApi(): ApiClient {
  const { getToken } = useAuth();
  return useMemo(() => new ApiClient({ baseUrl: "", getToken }), [getToken]);
}

/** Current user's profile (role, rider/merchant links). */
export function useMe() {
  const api = useApi();
  const { isSignedIn, isLoaded } = useAuth();
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.getMe(),
    enabled: isLoaded && isSignedIn,
    staleTime: 60_000,
  });
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export { ApiError };
