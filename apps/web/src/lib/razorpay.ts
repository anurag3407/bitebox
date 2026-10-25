declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (resp: any) => void) => void };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Razorpay can only load in the browser"));
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null;
        reject(new Error("Could not load the payment window. Check your connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/**
 * Opens Razorpay Checkout. Resolves with the signed result on success, null if the
 * customer closed the window, and rejects with the gateway's reason on failure.
 */
export async function openRazorpayCheckout(input: {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  orderNumber: string;
  prefill?: { name?: string; email?: string; contact?: string };
}): Promise<RazorpaySuccess | null> {
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: input.keyId,
      order_id: input.razorpayOrderId,
      amount: input.amountPaise,
      currency: "INR",
      name: "BiteBox",
      description: `Order ${input.orderNumber}`,
      prefill: input.prefill,
      theme: { color: "#111111" },
      retry: { enabled: true, max_count: 3 },
      handler: (resp: RazorpaySuccess) => resolve(resp),
      modal: { ondismiss: () => resolve(null), confirm_close: true },
    });
    rzp.on("payment.failed", (resp: any) => reject(new Error(resp?.error?.description ?? "Payment failed")));
    rzp.open();
  });
}
