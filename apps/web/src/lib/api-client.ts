import { ApiClient } from "@startup/api-client";
import { useAuthStore } from "@/features/auth/auth-store";

export function createApiClient(): ApiClient {
  return new ApiClient({
    baseUrl: "",
    getToken: () => {
      if (typeof window === "undefined") return null;
      return useAuthStore.getState().getToken();
    },
  });
}
