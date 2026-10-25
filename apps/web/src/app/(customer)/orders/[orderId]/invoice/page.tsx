"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import type { InvoiceSectionDto } from "@startup/api-client";
import { EmptyState, PageSpinner } from "@/components/ui/misc";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

function Section({ s }: { s: InvoiceSectionDto }) {
  const money = (p: number) => formatRupees(p, { decimals: true });
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold text-ink">
        {s.title} <span className="font-normal text-ink-muted">· SAC {s.sac} · GST {s.ratePercent}%</span>
      </h2>
      <table className="mt-3 w-full text-sm tabular">
        <tbody>
          {s.lines.map((l, i) => (
            <tr key={i} className="border-b border-line">
              <td className="py-2.5 text-ink">
                {l.quantity ? `${l.quantity} × ` : ""}
                {l.description}
              </td>
              <td className="py-2.5 text-right text-ink">{money(l.amountPaise)}</td>
            </tr>
          ))}
          {s.discountPaise > 0 && (
            <tr>
              <td className="py-1.5 text-ink-muted">Discount</td>
              <td className="py-1.5 text-right text-ink-muted">−{money(s.discountPaise)}</td>
            </tr>
          )}
          <tr>
            <td className="pt-3 py-1.5 text-ink">Taxable value</td>
            <td className="pt-3 py-1.5 text-right text-ink">{money(s.taxablePaise)}</td>
          </tr>
          <tr>
            <td className="py-1.5 text-ink-muted">CGST @ {s.ratePercent / 2}%</td>
            <td className="py-1.5 text-right text-ink-muted">{money(s.cgstPaise)}</td>
          </tr>
          <tr>
            <td className="py-1.5 text-ink-muted">SGST @ {s.ratePercent / 2}%</td>
            <td className="py-1.5 text-right text-ink-muted">{money(s.sgstPaise)}</td>
          </tr>
          <tr className="font-semibold text-ink">
            <td className="py-1.5 text-ink-muted">Total</td>
            <td className="py-1.5 text-right text-ink-muted">{money(s.totalPaise)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/** Printable GST tax invoice ("Save as PDF" from the print dialog). */
export default function InvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const api = useApi();
  const { isSignedIn } = useAuth();
  const q = useQuery({ queryKey: ["invoice", orderId], queryFn: () => api.getInvoice(orderId), enabled: isSignedIn, retry: false });

  if (q.isPending) return <PageSpinner />;
  if (!q.data) return <EmptyState title="Invoice not available" body={errorMessage(q.error)} />;
  const inv = q.data.invoice;

  return (
    <div className="page-narrow pb-16 pt-8 print:p-0">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <Link href={`/orders/${orderId}`} className="btn btn-ghost btn-sm -ml-4 gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Order
        </Link>
        <button onClick={() => window.print()} className="btn btn-outline btn-sm">
          <Printer className="h-4 w-4" /> Print or save PDF
        </button>
      </div>
      <article className="card p-6 sm:p-10 print:border-0 print:p-0">
        <header className="flex justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Tax invoice</h1>
            <p className="mt-1 text-sm text-ink-muted">Invoice no. {inv.invoiceNumber}</p>
            <p className="text-sm text-ink-muted">Issued {formatDateTime(inv.issuedAt)}</p>
            <p className="text-sm text-ink-muted">Order #{inv.orderNumber} · {formatDateTime(inv.orderDate)}</p>
          </div>
          <div className="text-right text-sm text-ink-soft">
            <p className="font-medium text-ink">{inv.platform.legalName}</p>
            <p className="text-ink-muted">{inv.platform.address}</p>
            <p className="text-ink-muted">GSTIN {inv.platform.gstin}</p>
          </div>
        </header>
        <div className="mt-10 grid grid-cols-2 gap-6 text-sm text-ink-soft">
          <div>
            <p className="eyebrow mb-2">Restaurant</p>
            <p className="font-medium text-ink">{inv.restaurant.name}</p>
            <p>{inv.restaurant.address}</p>
            {inv.restaurant.gstin && <p>GSTIN {inv.restaurant.gstin}</p>}
            {inv.restaurant.fssai && <p>FSSAI {inv.restaurant.fssai}</p>}
          </div>
          <div>
            <p className="eyebrow mb-2">Billed to</p>
            <p className="font-medium text-ink">{inv.customer.name}</p>
            <p>{inv.customer.address}</p>
          </div>
        </div>
        <Section s={inv.food} />
        <Section s={inv.services} />
        {inv.tipPaise > 0 && (
          <p className="mt-8 flex justify-between text-sm text-ink-soft">
            <span>Delivery partner tip (not taxable, paid in full to partner)</span>
            <span>{formatRupees(inv.tipPaise, { decimals: true })}</span>
          </p>
        )}
        <p className="mt-6 flex justify-between border-t border-line pt-6 text-base font-semibold text-ink tabular">
          <span>Amount paid ({inv.paymentMode})</span>
          <span>{formatRupees(inv.grandTotalPaise, { decimals: true })}</span>
        </p>
        <p className="mt-8 text-xs leading-relaxed text-ink-muted">
          Restaurant service supplied through an electronic commerce operator; GST on it is paid by the operator under section 9(5) of the CGST Act, 2017.
          This is a computer-generated invoice and does not require a signature.
        </p>
        {q.data.creditNotes.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-ink">Credit notes</h2>
            {q.data.creditNotes.map((c) => (
              <p key={c.creditNoteNumber} className="mt-2 text-sm text-ink-soft">
                {c.creditNoteNumber} · {formatDateTime(c.issuedAt)} · {formatRupees(c.amountPaise, { decimals: true })} (taxable {formatRupees(c.taxablePaise, { decimals: true })}, CGST{" "}
                {formatRupees(c.cgstPaise, { decimals: true })}, SGST {formatRupees(c.sgstPaise, { decimals: true })}) — {c.reason}
              </p>
            ))}
          </section>
        )}
      </article>
    </div>
  );
}
