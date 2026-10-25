import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink">You&apos;re offline</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          Check your connection. Your cart is saved on this device, and live tracking picks up again when you&apos;re back online.
        </p>
        <Link href="/" className="btn btn-primary mt-8">
          Try again
        </Link>
      </div>
    </main>
  );
}
