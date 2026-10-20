import Link from "next/link";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-surface-muted">
      <div className="max-w-sm text-center bg-white rounded-3xl border border-border p-8 shadow-sm">
        <img src="/icons/icon-192.png" alt="" className="w-16 h-16 mx-auto rounded-2xl mb-4" />
        <h1 className="text-xl font-black text-text-primary">You are offline</h1>
        <p className="text-sm text-text-secondary mt-2">
          Check your internet connection. Your cart is saved on this device and live order tracking resumes when you are back online.
        </p>
        <Link href="/" className="inline-block mt-6 px-5 py-2.5 bg-brand text-white text-sm font-bold rounded-xl">
          Try again
        </Link>
      </div>
    </main>
  );
}
