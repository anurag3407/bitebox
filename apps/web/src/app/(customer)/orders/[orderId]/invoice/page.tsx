"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import type { InvoiceSectionDto } from "@startup/api-client";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

function Section({ s }: { s: InvoiceSectionDto }) {
  const money = (p: number) => formatRupees(p, { decimals: true });
  return (
    <section className="mt-6">
      <h2 className="font-bold text-sm">
        {s.title} <span className="text-text-secondary font-normal">· SAC {s.sac} · GST {s.ratePercent}%</span>
      </h2>
      <table className="w-full text-sm mt-2">
        <tbody>
          {s.lines.map((l, i) => (
            <tr key={i} className="border-b border-border">
              <td className="py-1.5">
                {l.quantity ? `${l.quantity} × ` : ""}
                {l.description}
              </td>
              <td className="py-1.5 text-right">{money(l.amountPaise)}</td>
            </tr>
          ))}
          {s.discountPaise > 0 && (
            <tr>
              <td className="py-1">Discount</td>
              <td className="py-1 text-right">−{money(s.discountPaise)}</td>
            </tr>
          )}
          <tr>
            <td className="py-1 font-semibold">Taxable value</td>
            <td className="py-1 text-right font-semibold">{money(s.taxablePaise)}</td>
          </tr>
          <tr>
            <td className="py-1">CGST @ {s.ratePercent / 2}%</td>
            <td className="py-1 text-right">{money(s.cgstPaise)}</td>
          </tr>
          <tr>
            <td className="py-1">SGST @ {s.ratePercent / 2}%</td>
            <td className="py-1 text-right">{money(s.sgstPaise)}</td>
          </tr>
          <tr className="font-bold">
            <td className="py-1">Total</td>
            <td className="py-1 text-right">{money(s.totalPaise)}</td>
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

  if (q.isPending) return <div className="p-10 text-center"><Spinner /></div>;
  if (!q.data) return <div className="max-w-md mx-auto my-16 px-4"><EmptyState title="Invoice not available" body={errorMessage(q.error)} /></div>;
  const inv = q.data.invoice;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 print:p-0">
      <div className="flex justify-end mb-4 print:hidden">
        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-bold">
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>
      <article className="bg-white border border-border rounded-2xl p-6 print:border-0">
        <header className="flex justify-between gap-4">
          <div>
            <h1 className="text-xl font-black">Tax Invoice</h1>
            <p className="text-xs text-text-secondary">Invoice no. {inv.invoiceNumber}</p>
            <p className="text-xs text-text-secondary">Issued {formatDateTime(inv.issuedAt)}</p>
            <p className="text-xs text-text-secondary">Order #{inv.orderNumber} · {formatDateTime(inv.orderDate)}</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">{inv.platform.legalName}</p>
            <p className="text-text-secondary">{inv.platform.address}</p>
            <p className="text-text-secondary">GSTIN {inv.platform.gstin}</p>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-4 mt-6 text-xs">
          <div>
            <p className="font-bold uppercase text-text-secondary">Restaurant</p>
            <p className="font-semibold">{inv.restaurant.name}</p>
            <p>{inv.restaurant.address}</p>
            {inv.restaurant.gstin && <p>GSTIN {inv.restaurant.gstin}</p>}
            {inv.restaurant.fssai && <p>FSSAI {inv.restaurant.fssai}</p>}
          </div>
          <div>
            <p className="font-bold uppercase text-text-secondary">Billed to</p>
            <p className="font-semibold">{inv.customer.name}</p>
            <p>{inv.customer.address}</p>
          </div>
        </div>
        <Section s={inv.food} />
        <Section s={inv.services} />
        {inv.tipPaise > 0 && (
          <p className="mt-4 text-sm flex justify-between">
            <span>Delivery partner tip (not taxable, paid in full to partner)</span>
            <span>{formatRupees(inv.tipPaise, { decimals: true })}</span>
          </p>
        )}
        <p className="mt-4 pt-4 border-t border-border flex justify-between font-black">
          <span>Amount paid ({inv.paymentMode})</span>
          <span>{formatRupees(inv.grandTotalPaise, { decimals: true })}</span>
        </p>
        <p className="mt-4 text-[10px] text-text-secondary">
          Restaurant service supplied through an electronic commerce operator; GST on it is paid by the operator under section 9(5) of the CGST Act, 2017.
          This is a computer-generated invoice and does not require a signature.
        </p>
        {q.data.creditNotes.length > 0 && (
          <section className="mt-6">
            <h2 className="font-bold text-sm">Credit notes</h2>
            {q.data.creditNotes.map((c) => (
              <p key={c.creditNoteNumber} className="text-xs mt-1">
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
