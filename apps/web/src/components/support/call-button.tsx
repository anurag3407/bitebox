"use client";

import React, { useState } from "react";
import { Phone } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/misc";
import { errorMessage, useApi } from "@/lib/api";

/**
 * Calls another party of an order without exposing numbers: the server rings this
 * user and bridges the call from a virtual number. Falls back to dialling directly
 * only when the server returns a number (telephony not configured).
 */
export function CallButton({
  orderId,
  target,
  label,
  className = "btn btn-outline btn-sm",
}: {
  orderId: string;
  target: "RIDER" | "CUSTOMER" | "RESTAURANT";
  label: string;
  className?: string;
}) {
  const api = useApi();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await api.placeCall(orderId, target);
          if (res.mode === "DIRECT") window.location.href = `tel:${res.phone}`;
          else toast(res.message, "success");
        } catch (err) {
          toast(errorMessage(err), "error");
        } finally {
          setBusy(false);
        }
      }}
      className={className}
    >
      {busy ? <Spinner /> : <Phone className="h-4 w-4" />} {label}
    </button>
  );
}
