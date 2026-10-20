import type { PoolClient } from "pg";
import type { QuoteBreakdown, QuoteLineBreakdown } from "@startup/contracts";
import { DomainError, InvoiceSection, buildInvoiceSections, financialYear, formatInvoiceNumber, splitIntraState } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";

export interface PlatformEntity {
  legalName: string;
  gstin: string;
  address: string;
  invoicePrefix: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  issuedAt: string;
  orderNumber: string;
  orderDate: string;
  platform: PlatformEntity;
  restaurant: { name: string; address: string; gstin: string | null; fssai: string | null };
  customer: { name: string; address: string };
  food: InvoiceSection;
  services: InvoiceSection;
  tipPaise: number;
  grandTotalPaise: number;
  paymentMode: string;
}

export interface CreditNoteData {
  creditNoteNumber: string;
  invoiceNumber: string;
  issuedAt: string;
  amountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  reason: string;
}

/** Next number in a gapless per-FY series; the row lock serialises issuers and rolls back with the transaction. */
async function nextSequence(client: Pick<PoolClient, "query">, series: string): Promise<number> {
  const res = await client.query(
    `INSERT INTO invoice_sequences (financial_year, last_seq) VALUES ($1, 1)
     ON CONFLICT (financial_year) DO UPDATE SET last_seq = invoice_sequences.last_seq + 1
     RETURNING last_seq`,
    [series]
  );
  return res.rows[0].last_seq;
}

export class InvoiceRepository {
  /** Issues the tax invoice for a paid, delivered order. Idempotent: re-issuing returns the original. */
  static async issueForOrder(orderId: string, platform: PlatformEntity): Promise<{ invoiceNumber: string; created: boolean }> {
    return withTransaction(async (client) => {
      const existing = await client.query(`SELECT invoice_number FROM invoices WHERE order_id = $1`, [orderId]);
      if (existing.rows[0]) return { invoiceNumber: existing.rows[0].invoice_number, created: false };

      const res = await client.query(
        `SELECT o.*, r.name AS restaurant_name, r.address_text, r.gstin AS restaurant_gstin,
                COALESCE(r.fssai_license_number, m.fssai_license_number) AS fssai,
                u.name AS customer_name, a.building, a.street
           FROM orders o
           JOIN restaurants r ON r.id = o.restaurant_id
           JOIN merchants m ON m.id = r.merchant_id
           JOIN app_users u ON u.id = o.customer_id
           JOIN customer_addresses a ON a.id = o.delivery_address_id
          WHERE o.id = $1 FOR UPDATE OF o`,
        [orderId]
      );
      const o = res.rows[0];
      if (!o) throw new DomainError("NOT_FOUND", "Order not found");
      if (o.payment_status === "PENDING") throw new DomainError("STATE_CONFLICT", "Unpaid orders are not invoiced");

      const issuedAt = new Date();
      const fy = financialYear(issuedAt);
      const seq = await nextSequence(client, fy);
      const invoiceNumber = formatInvoiceNumber(platform.invoicePrefix, fy, seq);
      const snapshot = o.delivery_address_snapshot ?? { building: o.building, street: o.street };
      const sections = buildInvoiceSections(o.breakdown_json as QuoteBreakdown, o.items_json as QuoteLineBreakdown[]);

      const data: InvoiceData = {
        invoiceNumber,
        issuedAt: issuedAt.toISOString(),
        orderNumber: o.order_number,
        orderDate: (o.created_at as Date).toISOString(),
        platform,
        restaurant: { name: o.restaurant_name, address: o.address_text, gstin: o.restaurant_gstin, fssai: o.fssai },
        customer: { name: o.customer_name, address: `${snapshot.building}, ${snapshot.street}` },
        ...sections,
        paymentMode: "Online (Razorpay)",
      };
      await client.query(
        `INSERT INTO invoices (order_id, invoice_number, financial_year, seq, data_json, issued_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, invoiceNumber, fy, seq, JSON.stringify(data), issuedAt.toISOString()]
      );
      return { invoiceNumber, created: true };
    });
  }

  static async findByOrder(orderId: string): Promise<{ invoice: InvoiceData; creditNotes: CreditNoteData[] } | null> {
    const res = await getDbPool().query(`SELECT id, data_json FROM invoices WHERE order_id = $1`, [orderId]);
    if (!res.rows[0]) return null;
    const notes = await getDbPool().query(`SELECT data_json FROM credit_notes WHERE invoice_id = $1 ORDER BY issued_at`, [res.rows[0].id]);
    return { invoice: res.rows[0].data_json, creditNotes: notes.rows.map((n) => n.data_json) };
  }

  /**
   * GST credit note for a processed refund on an invoiced order. The refund is treated as
   * tax-inclusive and apportioned at the food rate first (the common case: missing items).
   */
  static async issueCreditNote(refundId: string, prefix: string): Promise<string | null> {
    return withTransaction(async (client) => {
      const existing = await client.query(`SELECT credit_note_number FROM credit_notes WHERE refund_id = $1`, [refundId]);
      if (existing.rows[0]) return existing.rows[0].credit_note_number;
      const res = await client.query(
        `SELECT r.amount_paise, r.reason, r.status, i.id AS invoice_id, i.invoice_number, i.data_json
           FROM refunds r JOIN invoices i ON i.order_id = r.order_id WHERE r.id = $1`,
        [refundId]
      );
      const row = res.rows[0];
      if (!row || row.status !== "PROCESSED") return null; // not invoiced yet, or refund not final

      const issuedAt = new Date();
      const fy = financialYear(issuedAt);
      const seq = await nextSequence(client, `${fy}-CN`);
      const number = formatInvoiceNumber(`${prefix.slice(0, 2)}C`, fy, seq);
      const taxable = Math.round((row.amount_paise * 100) / 105);
      const data: CreditNoteData = {
        creditNoteNumber: number,
        invoiceNumber: row.invoice_number,
        issuedAt: issuedAt.toISOString(),
        amountPaise: row.amount_paise,
        taxablePaise: taxable,
        ...splitIntraState(row.amount_paise - taxable),
        reason: row.reason,
      };
      await client.query(
        `INSERT INTO credit_notes (invoice_id, refund_id, credit_note_number, financial_year, seq, amount_paise, data_json, issued_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.invoice_id, refundId, number, fy, seq, row.amount_paise, JSON.stringify(data), issuedAt.toISOString()]
      );
      return number;
    });
  }
}
