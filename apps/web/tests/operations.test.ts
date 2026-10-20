import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { SettlementCalculator } from "@startup/core";
import { InvoiceRepository, OrderRepository, PayoutRepository, RefundRepository, SEED_IDS, getDbPool, withTransaction } from "@startup/database";
import { MENU, call, createCustomerWithAddress, createMerchantStaff, createUser, deliverOrder } from "./helpers.js";
import { handleIssueCreditNote, handleIssueInvoice, handlePayoutSubmit, platformEntity, settlementCutoff } from "../../worker/src/handlers.js";

import { POST as applyPartner } from "../src/app/api/v1/partner/applications/route.js";
import { GET as listApplications } from "../src/app/api/v1/admin/applications/route.js";
import { POST as reviewApplication } from "../src/app/api/v1/admin/applications/[applicationId]/review/route.js";
import { GET as searchUsers } from "../src/app/api/v1/admin/users/route.js";
import { PATCH as updateUser } from "../src/app/api/v1/admin/users/[userId]/route.js";
import { GET as getMe, DELETE as deleteMe } from "../src/app/api/v1/me/route.js";
import { GET as editableMenu } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/menu/route.js";
import { POST as createCategory } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/menu/categories/route.js";
import { POST as createItem } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/menu/items/route.js";
import { PUT as updateItem, DELETE as archiveItem } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/menu/items/[itemId]/route.js";
import { PATCH as updateSettings } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/settings/route.js";
import { POST as addStaff } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/staff/route.js";
import { GET as merchantEarnings } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/earnings/route.js";
import { PUT as merchantPayoutAccount } from "../src/app/api/v1/merchant/restaurants/[restaurantId]/payout-account/route.js";
import { GET as publicMenu } from "../src/app/api/v1/restaurants/[slug]/route.js";
import { POST as createQuote } from "../src/app/api/v1/quotes/route.js";
import { GET as getInvoice } from "../src/app/api/v1/orders/[orderId]/invoice/route.js";
import { GET as getTracking } from "../src/app/api/v1/orders/[orderId]/tracking/route.js";
import { POST as placeCall } from "../src/app/api/v1/orders/[orderId]/call/route.js";
import { POST as openTicket, GET as myTickets } from "../src/app/api/v1/support/route.js";
import { GET as viewTicket, POST as customerReply } from "../src/app/api/v1/support/[ticketId]/route.js";
import { POST as agentReply } from "../src/app/api/v1/admin/support/[ticketId]/route.js";
import { POST as resolveTicket } from "../src/app/api/v1/admin/support/[ticketId]/resolve/route.js";
import { GET as exportData } from "../src/app/api/v1/me/export/route.js";
import { NextRequest } from "next/server";

const MERCHANT_APPLICATION = {
  legalBusinessName: "Test Kitchens LLP",
  restaurantName: `Test Tandoor ${randomUUID().slice(0, 6)}`,
  fssaiLicenseNumber: "12345678901234",
  gstin: "07ABCDE1234F1Z5",
  pan: "ABCDE1234F",
  contactPhone: "9876500000",
  contactEmail: "owner@test.example",
  addressText: "Janpath, New Delhi",
  location: { latitude: 28.625, longitude: 77.219 },
  cuisines: ["North Indian"],
  pureVeg: false,
  avgPriceForOnePaise: 30000,
};

describe("Partner onboarding & admin roles", () => {
  it("turns an approved restaurant application into a paused outlet owned by the applicant", async () => {
    const admin = await createUser("ADMIN");
    const applicant = await createUser("CUSTOMER");
    const submitted = await call(applyPartner, "POST", "/p", { token: applicant.token, body: { type: "MERCHANT", details: MERCHANT_APPLICATION } });
    expect(submitted.status).toBe(201);
    const dup = await call(applyPartner, "POST", "/p", { token: applicant.token, body: { type: "MERCHANT", details: MERCHANT_APPLICATION } });
    expect(dup.status).toBe(409);

    // Only admins review
    const id = submitted.body.data.id;
    expect((await call(reviewApplication, "POST", "/r", { token: applicant.token, params: { applicationId: id }, body: { decision: "APPROVE" } })).status).toBe(403);
    const queue = await call(listApplications, "GET", "/a", { token: admin.token });
    expect(queue.body.data.map((a: any) => a.id)).toContain(id);

    const approved = await call(reviewApplication, "POST", "/r", { token: admin.token, params: { applicationId: id }, body: { decision: "APPROVE", note: "Docs verified" } });
    expect(approved.status).toBe(200);
    const restaurantId = approved.body.data.restaurantId;

    const me = await call(getMe, "GET", "/me", { token: applicant.token });
    expect(me.body.data.role).toBe("MERCHANT_STAFF");
    expect(me.body.data.restaurants[0]).toMatchObject({ id: restaurantId, staffRole: "OWNER", isAcceptingOrders: false });
    const audit = await getDbPool().query(`SELECT action FROM admin_audit_log WHERE target_id = $1`, [id]);
    expect(audit.rows[0].action).toBe("PARTNER_APPROVED");
  });

  it("validates applications and refuses outlets outside the service area", async () => {
    const admin = await createUser("ADMIN");
    const applicant = await createUser("CUSTOMER");
    const bad = await call(applyPartner, "POST", "/p", {
      token: applicant.token,
      body: { type: "MERCHANT", details: { ...MERCHANT_APPLICATION, fssaiLicenseNumber: "123" } },
    });
    expect(bad.status).toBe(400);
    const far = await call(applyPartner, "POST", "/p", {
      token: applicant.token,
      body: { type: "MERCHANT", details: { ...MERCHANT_APPLICATION, location: { latitude: 19.07, longitude: 72.87 } } },
    });
    const res = await call(reviewApplication, "POST", "/r", { token: admin.token, params: { applicationId: far.body.data.id }, body: { decision: "APPROVE" } });
    expect(res.status).toBe(422);
  });

  it("onboards riders and lets admins change roles with an audit trail, but never their own", async () => {
    const admin = await createUser("ADMIN");
    const applicant = await createUser("CUSTOMER");
    const app = await call(applyPartner, "POST", "/p", {
      token: applicant.token,
      body: { type: "RIDER", details: { fullName: "Ravi Test", phone: "9811111111", vehicleType: "MOTORCYCLE", vehicleNumber: "DL3CAB1234", city: "New Delhi" } },
    });
    await call(reviewApplication, "POST", "/r", { token: admin.token, params: { applicationId: app.body.data.id }, body: { decision: "APPROVE" } });
    expect((await call(getMe, "GET", "/me", { token: applicant.token })).body.data.role).toBe("RIDER");

    const demote = await call(updateUser, "PATCH", "/u", { token: admin.token, params: { userId: applicant.userId }, body: { role: "CUSTOMER", reason: "Left the fleet" } });
    expect(demote.status).toBe(200);
    const rider = await getDbPool().query(`SELECT is_approved, is_online FROM riders WHERE user_id = $1`, [applicant.userId]);
    expect(rider.rows[0]).toEqual({ is_approved: false, is_online: false });

    expect((await call(updateUser, "PATCH", "/u", { token: admin.token, params: { userId: admin.userId }, body: { role: "CUSTOMER", reason: "oops" } })).status).toBe(403);
    const found = await call(searchUsers, "GET", `/u?q=${encodeURIComponent(applicant.clerkUserId)}`, { token: admin.token });
    expect(found.body.data[0].id).toBe(applicant.userId);
  });
});

describe("Menu editor", () => {
  it("lets catalogue staff build a dish with portions and add-ons that customers can order", async () => {
    const owner = await createMerchantStaff(SEED_IDS.restaurant2Id);
    await getDbPool().query(`UPDATE merchant_memberships SET staff_role = 'OWNER' WHERE user_id = $1`, [owner.userId]);
    const params = { restaurantId: SEED_IDS.restaurant2Id };

    const cat = await call(createCategory, "POST", "/c", { token: owner.token, params, body: { name: `Specials ${randomUUID().slice(0, 4)}` } });
    expect(cat.status).toBe(201);
    const item = await call(createItem, "POST", "/i", {
      token: owner.token,
      params,
      body: {
        categoryId: cat.body.data.id,
        name: "Paneer Kathi Roll",
        pricePaise: 18000,
        dietaryTag: "VEG",
        variants: [
          { name: "Single", pricePaise: 18000 },
          { name: "Double", pricePaise: 26000 },
        ],
        modifierGroups: [{ name: "Extras", minSelect: 0, maxSelect: 2, isRequired: false, options: [{ name: "Cheese", pricePaise: 3000 }, { name: "Mint mayo", pricePaise: 1500 }] }],
      },
    });
    expect(item.status).toBe(201);
    const itemId = item.body.data.id;

    // Public menu reflects the change immediately (cache invalidated)
    const menu = await call(publicMenu, "GET", "/m", { params: { slug: "bikanervala-sweets" } });
    const dish = menu.body.data.categories.flatMap((c: any) => c.items).find((i: any) => i.id === itemId);
    expect(dish.variants).toHaveLength(2);
    expect(dish.modifierGroups[0].options).toHaveLength(2);

    // Edit keeps existing ids (carts stay valid) and drops removed children
    const editable = await call(editableMenu, "GET", "/e", { token: owner.token, params });
    const saved = editable.body.data.categories.flatMap((c: any) => c.items).find((i: any) => i.id === itemId);
    const keep = saved.variants[0];
    const upd = await call(updateItem, "PUT", "/i", {
      token: owner.token,
      params: { ...params, itemId },
      body: { ...saved, variants: [{ ...keep, pricePaise: 19000 }], modifierGroups: [] },
    });
    expect(upd.status).toBe(200);
    const after = await getDbPool().query(`SELECT id, price_paise FROM item_variants WHERE menu_item_id = $1`, [itemId]);
    expect(after.rows).toEqual([{ id: keep.id, price_paise: 19000 }]);

    // Customers can order it
    const customer = await createCustomerWithAddress();
    const quote = await call(createQuote, "POST", "/q", {
      token: customer.token,
      body: { restaurantId: SEED_IDS.restaurant2Id, deliveryAddressId: customer.addressId, items: [{ menuItemId: itemId, variantId: keep.id, quantity: 1 }] },
    });
    // Bikanervala keeps real opening hours; when closed the quote is refused for that reason only
    if (quote.status === 422) expect(quote.body.error?.message).toMatch(/closed/i);
    else expect(quote.body.data.breakdown.subtotalPaise).toBe(19000);

    // Archived dishes disappear and cannot be quoted
    expect((await call(archiveItem, "DELETE", "/i", { token: owner.token, params: { ...params, itemId } })).status).toBe(200);
    const menuAfter = await call(publicMenu, "GET", "/m", { params: { slug: "bikanervala-sweets" } });
    expect(menuAfter.body.data.categories.flatMap((c: any) => c.items).some((i: any) => i.id === itemId)).toBe(false);
  });

  it("enforces staff roles and restaurant boundaries", async () => {
    const kitchen = await createMerchantStaff(SEED_IDS.restaurant1Id);
    await getDbPool().query(`UPDATE merchant_memberships SET staff_role = 'KITCHEN' WHERE user_id = $1`, [kitchen.userId]);
    const otherOutlet = await createMerchantStaff(SEED_IDS.restaurant3Id);
    const params = { restaurantId: SEED_IDS.restaurant1Id };
    const body = { categoryId: "80000000-0000-4000-8000-000000000001", name: "X", pricePaise: 1000, dietaryTag: "VEG" };

    expect((await call(createItem, "POST", "/i", { token: kitchen.token, params, body })).status).toBe(403);
    expect((await call(createItem, "POST", "/i", { token: otherOutlet.token, params, body })).status).toBe(403);
    expect((await call(updateSettings, "PATCH", "/s", { token: kitchen.token, params, body: { packagingFeePaise: 0 } })).status).toBe(403);
    expect((await call(addStaff, "POST", "/s", { token: kitchen.token, params, body: { email: "x@example.com", staffRole: "KITCHEN" } })).status).toBe(403);
    // Kitchen staff can still read the menu to toggle stock
    expect((await call(editableMenu, "GET", "/e", { token: kitchen.token, params })).status).toBe(200);
  });

  it("validates add-on bounds", async () => {
    const owner = await createMerchantStaff(SEED_IDS.restaurant1Id);
    await getDbPool().query(`UPDATE merchant_memberships SET staff_role = 'OWNER' WHERE user_id = $1`, [owner.userId]);
    const res = await call(createItem, "POST", "/i", {
      token: owner.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
      body: {
        categoryId: "80000000-0000-4000-8000-000000000001",
        name: "Bad",
        pricePaise: 1000,
        dietaryTag: "VEG",
        modifierGroups: [{ name: "G", minSelect: 3, maxSelect: 2, isRequired: true, options: [{ name: "a", pricePaise: 0 }] }],
      },
    });
    expect(res.status).toBe(400);
  });
});

describe("GST invoices", () => {
  it("issues one sequential invoice per delivered order whose sections add up to the amount paid", async () => {
    const a = await deliverOrder();
    const b = await deliverOrder();
    const job = (orderId: string) => ({ id: randomUUID(), kind: "ISSUE_INVOICE", payload: { orderId }, attemptCount: 1, maxAttempts: 5 });
    await handleIssueInvoice(job(a.orderId));
    await handleIssueInvoice(job(a.orderId)); // idempotent
    await handleIssueInvoice(job(b.orderId));

    const ia = (await InvoiceRepository.findByOrder(a.orderId))!.invoice;
    const ib = (await InvoiceRepository.findByOrder(b.orderId))!.invoice;
    expect(ia.invoiceNumber).toMatch(/^ZF\d{4}-\d{7}$/);
    expect(Number(ib.invoiceNumber.slice(-7))).toBe(Number(ia.invoiceNumber.slice(-7)) + 1);
    expect(ia.grandTotalPaise).toBe(a.breakdown.payablePaise);
    expect(ia.food.cgstPaise + ia.food.sgstPaise).toBe(2800);
    expect(ia.services.cgstPaise + ia.services.sgstPaise).toBe(990);

    expect((await call(getInvoice, "GET", "/i", { token: a.customer.token, params: { orderId: a.orderId } })).status).toBe(200);
    expect((await call(getInvoice, "GET", "/i", { token: b.customer.token, params: { orderId: a.orderId } })).status).toBe(404);
  });

  it("issues a credit note when an invoiced order is refunded", async () => {
    const order = await deliverOrder();
    await handleIssueInvoice({ id: randomUUID(), kind: "ISSUE_INVOICE", payload: { orderId: order.orderId }, attemptCount: 1, maxAttempts: 5 });
    const refund = await withTransaction(async (client) => {
      await OrderRepository.lockForUpdate(client, order.orderId);
      return RefundRepository.issueWithClient(client, { orderId: order.orderId, amountPaise: 5000, reason: "Missing raita", initiatedBy: "ADMIN" });
    });
    await RefundRepository.applyProviderResult({ refundId: refund!.refundId, providerRefundId: `rfnd_${randomUUID().slice(0, 10)}`, status: "PROCESSED" });
    await handleIssueCreditNote({ id: randomUUID(), kind: "ISSUE_CREDIT_NOTE", payload: { refundId: refund!.refundId }, attemptCount: 1, maxAttempts: 5 });
    const notes = (await InvoiceRepository.findByOrder(order.orderId))!.creditNotes;
    expect(notes).toHaveLength(1);
    expect(notes[0]!.amountPaise).toBe(5000);
    expect(notes[0]!.taxablePaise + notes[0]!.cgstPaise + notes[0]!.sgstPaise).toBe(5000);
  });
});

describe("Payouts", () => {
  it("settles each delivered order exactly once, encrypts bank details and pays through RazorpayX", async () => {
    const delivered = await deliverOrder();
    const merchantId = (await getDbPool().query(`SELECT merchant_id FROM restaurants WHERE id = $1`, [SEED_IDS.restaurant1Id])).rows[0].merchant_id;

    const owner = await createMerchantStaff(SEED_IDS.restaurant1Id);
    await getDbPool().query(`UPDATE merchant_memberships SET staff_role = 'OWNER' WHERE user_id = $1`, [owner.userId]);
    const acct = await call(merchantPayoutAccount, "PUT", "/a", {
      token: owner.token,
      params: { restaurantId: SEED_IDS.restaurant1Id },
      body: { accountHolderName: "Spice Crafters", ifsc: "HDFC0001234", accountNumber: "50100123456789" },
    });
    expect(acct.body.data.accountLast4).toBe("6789");
    const stored = await getDbPool().query(`SELECT account_number_encrypted FROM payout_accounts WHERE owner_id = $1`, [merchantId]);
    expect(stored.rows[0].account_number_encrypted).not.toContain("50100123456789");

    const before = await call(merchantEarnings, "GET", "/e", { token: owner.token, params: { restaurantId: SEED_IDS.restaurant1Id } });
    expect(before.body.data.unsettledPaise).toBeGreaterThanOrEqual(SettlementCalculator.merchantEarning(delivered.breakdown));

    const ids = await PayoutRepository.runSettlement(new Date(Date.now() + 1000), { automaticTransfers: true });
    expect(ids.length).toBeGreaterThan(0);
    expect(await PayoutRepository.runSettlement(new Date(Date.now() + 1000), { automaticTransfers: true })).toEqual([]);

    const item = await getDbPool().query(`SELECT owner_type, amount_paise, payout_id FROM payout_items WHERE order_id = $1 ORDER BY owner_type`, [delivered.orderId]);
    // The rider's ₹50 is below the ₹100 minimum and rolls over to the next cycle
    expect(item.rows.map((r) => [r.owner_type, r.amount_paise])).toEqual([["MERCHANT", SettlementCalculator.merchantEarning(delivered.breakdown)]]);

    // A second delivery by the same rider crosses the threshold; no bank account → manual transfer
    const second = await deliverOrder({ rider: delivered.rider });
    await PayoutRepository.runSettlement(new Date(Date.now() + 1000), { automaticTransfers: true });
    const riderItems = await getDbPool().query(
      `SELECT payout_id, amount_paise FROM payout_items WHERE owner_type = 'RIDER' AND order_id = ANY($1::uuid[])`,
      [[delivered.orderId, second.orderId]]
    );
    expect(riderItems.rows).toHaveLength(2);
    expect(new Set(riderItems.rows.map((r) => r.payout_id)).size).toBe(1);

    const merchantPayout = await PayoutRepository.findById(item.rows[0].payout_id);
    const riderPayout = await PayoutRepository.findById(riderItems.rows[0].payout_id);
    expect(merchantPayout?.status).toBe("PENDING");
    expect(riderPayout?.status).toBe("MANUAL");
    expect(riderPayout?.amountPaise).toBe(2 * SettlementCalculator.riderEarning(delivered.breakdown));

    await handlePayoutSubmit({ id: randomUUID(), kind: "PAYOUT_SUBMIT", payload: { payoutId: merchantPayout!.id }, attemptCount: 1, maxAttempts: 8 });
    const paid = await PayoutRepository.findById(merchantPayout!.id);
    expect(paid?.status).toBe("PAID");
    expect(paid?.utr).toBeTruthy();

    // A manual payout is closed by recording the bank UTR; ledger stays balanced
    await PayoutRepository.markPaid(riderPayout!.id, { utr: "NEFT12345678", adminId: owner.userId });
    const ledger = await getDbPool().query(`SELECT SUM(debit_paise)::bigint AS d, SUM(credit_paise)::bigint AS c FROM ledger_entries`);
    expect(ledger.rows[0].d).toBe(ledger.rows[0].c);
  });

  it("computes the weekly cutoff as Monday 00:00 IST", () => {
    // Wednesday 2026-10-21 15:00 IST → Monday 2026-10-19 00:00 IST = Sunday 18:30 UTC
    expect(settlementCutoff(new Date("2026-10-21T09:30:00Z")).toISOString()).toBe("2026-10-18T18:30:00.000Z");
    expect(platformEntity().invoicePrefix).toBe("ZF");
  });
});

describe("Support chat", () => {
  it("runs a conversation between a customer and an agent", async () => {
    const order = await deliverOrder();
    const admin = await createUser("ADMIN");
    const opened = await call(openTicket, "POST", "/s", {
      token: order.customer.token,
      body: { orderId: order.orderId, category: "MISSING_ITEM", message: "The raita was missing" },
    });
    expect(opened.status).toBe(201);
    const ticketId = opened.body.data.ticketId;

    // Tapping "Get help" again continues the same conversation
    const again = await call(openTicket, "POST", "/s", { token: order.customer.token, body: { orderId: order.orderId, category: "MISSING_ITEM", message: "Hello?" } });
    expect(again.body.data.ticketId).toBe(ticketId);

    const stranger = await createUser("CUSTOMER");
    expect((await call(viewTicket, "GET", "/t", { token: stranger.token, params: { ticketId } })).status).toBe(404);
    expect((await call(openTicket, "POST", "/s", { token: stranger.token, body: { orderId: order.orderId, category: "OTHER", message: "hijack" } })).status).toBe(404);

    expect((await call(agentReply, "POST", "/a", { token: admin.token, params: { ticketId }, body: { body: "Refunding ₹40 now" } })).status).toBe(201);
    let view = await call(viewTicket, "GET", "/t", { token: order.customer.token, params: { ticketId } });
    expect(view.body.data.ticket.status).toBe("AWAITING_CUSTOMER");
    expect(view.body.data.messages.map((m: any) => m.senderType)).toEqual(["CUSTOMER", "SYSTEM", "CUSTOMER", "AGENT"]);
    const notified = await getDbPool().query(`SELECT 1 FROM outbox_events WHERE event_type = 'support.agent_replied' AND aggregate_id = $1`, [ticketId]);
    expect(notified.rows.length).toBe(1);

    await call(resolveTicket, "POST", "/r", { token: admin.token, params: { ticketId }, body: { resolution: "Refunded ₹40" } });
    await call(customerReply, "POST", "/c", { token: order.customer.token, params: { ticketId }, body: { body: "Thanks!" } });
    view = await call(viewTicket, "GET", "/t", { token: order.customer.token, params: { ticketId } });
    expect(view.body.data.ticket.status).toBe("OPEN"); // customer reply reopens
    expect((await call(myTickets, "GET", "/s", { token: order.customer.token })).body.data).toHaveLength(1);
  });
});

describe("Masked calling", () => {
  it("never sends phone numbers in order payloads and only connects participants during the trip", async () => {
    const order = await deliverOrder();
    // After delivery the rider can no longer be called
    expect((await call(placeCall, "POST", "/c", { token: order.customer.token, params: { orderId: order.orderId }, body: { target: "RIDER" } })).status).toBe(403);
    // Re-open the trip window to test the in-flight path
    await getDbPool().query(`UPDATE delivery_assignments SET status = 'AT_DROPOFF' WHERE id = $1`, [order.assignmentId]);
    await getDbPool().query(`UPDATE orders SET fulfillment_state = 'OUT_FOR_DELIVERY' WHERE id = $1`, [order.orderId]);

    const tracking = await call(getTracking, "GET", "/t", { token: order.customer.token, params: { orderId: order.orderId } });
    expect(tracking.body.data.rider.phone).toBeUndefined();

    const res = await call(placeCall, "POST", "/c", { token: order.customer.token, params: { orderId: order.orderId }, body: { target: "RIDER" } });
    expect(res.status).toBe(200);
    // No telephony provider in tests: the number is revealed to this participant only, and logged
    expect(res.body.data).toEqual({ mode: "DIRECT", phone: "+919800000000" });
    const log = await getDbPool().query(`SELECT mode, target FROM call_logs WHERE order_id = $1`, [order.orderId]);
    expect(log.rows[0]).toEqual({ mode: "DIRECT", target: "RIDER" });

    const stranger = await createUser("CUSTOMER");
    expect((await call(placeCall, "POST", "/c", { token: stranger.token, params: { orderId: order.orderId }, body: { target: "RIDER" } })).status).toBe(404);
    await getDbPool().query(`UPDATE delivery_assignments SET status = 'COMPLETED' WHERE id = $1`, [order.assignmentId]);
    await getDbPool().query(`UPDATE orders SET fulfillment_state = 'DELIVERED' WHERE id = $1`, [order.orderId]);
  });
});

describe("Privacy rights", () => {
  it("exports data, refuses deletion mid-order and scrubs personal data on deletion", async () => {
    const order = await deliverOrder();
    const res = await exportData(
      new NextRequest("http://localhost/api/v1/me/export", { headers: { authorization: `Bearer ${order.customer.token}`, "x-real-ip": "10.0.0.9" } }),
      { params: Promise.resolve({}) }
    );
    const data = await res.json();
    expect(data.orders).toHaveLength(1);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);

    expect((await call(deleteMe, "DELETE", "/me", { token: order.customer.token, body: {} })).status).toBe(400);
    const deleted = await call(deleteMe, "DELETE", "/me", { token: order.customer.token, body: { confirm: "DELETE" } });
    expect(deleted.status).toBe(200);
    const user = await getDbPool().query(`SELECT name, email, phone, is_active FROM app_users WHERE id = $1`, [order.customer.userId]);
    expect(user.rows[0]).toEqual({ name: "Deleted user", email: null, phone: null, is_active: false });
    // Tax records survive
    expect((await getDbPool().query(`SELECT 1 FROM orders WHERE id = $1`, [order.orderId])).rows).toHaveLength(1);

    const busy = await createCustomerWithAddress();
    await getDbPool().query(
      `INSERT INTO orders (order_number, customer_id, restaurant_id, delivery_address_id, items_json, breakdown_json, payable_paise, delivery_otp, pickup_otp, fulfillment_state)
       VALUES ($1, $2, $3, $4, '[]', '{}', 100, '1', '1', 'PREPARING')`,
      [`ORD-BUSY-${randomUUID().slice(0, 6)}`, busy.userId, SEED_IDS.restaurant1Id, busy.addressId]
    );
    expect((await call(deleteMe, "DELETE", "/me", { token: busy.token, body: { confirm: "DELETE" } })).status).toBe(409);
    void MENU;
  });
});
