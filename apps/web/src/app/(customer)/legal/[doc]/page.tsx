import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerEnv } from "@startup/config";

export const dynamic = "force-dynamic";

const DOCS = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  refunds: "Cancellation & Refund Policy",
  grievance: "Grievance Redressal",
} as const;
type Doc = keyof typeof DOCS;

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  return { title: DOCS[(await params).doc as Doc] ?? "Legal" };
}

function Body({ doc, e }: { doc: Doc; e: ReturnType<typeof getServerEnv> }) {
  const entity = e.PLATFORM_LEGAL_NAME;
  switch (doc) {
    case "terms":
      return (
        <>
          <p>These terms govern your use of the BiteBox website and app operated by {entity} (“we”). By placing an order you agree to them.</p>
          <h2>1. Our role</h2>
          <p>We operate a marketplace. Food is prepared and supplied by independent partner restaurants, which are responsible for its quality, hygiene, allergen information and compliance with FSSAI rules. Deliveries are made by independent delivery partners.</p>
          <h2>2. Orders and prices</h2>
          <p>Prices, taxes, delivery and platform fees are shown before you pay and are fixed for that order. Delivery fees depend on distance. Coupons are subject to their stated conditions and may be withdrawn at any time.</p>
          <h2>3. Payment</h2>
          <p>Payments are processed by Razorpay. We never see or store your card details. An order is placed only once payment is confirmed.</p>
          <h2>4. Delivery</h2>
          <p>Delivery times are estimates. You must share the delivery OTP only after receiving your order. If you cannot be reached at the address for 10 minutes the order may be marked undelivered.</p>
          <h2>5. Acceptable use</h2>
          <p>Do not misuse coupons, provide false information, harass delivery partners or restaurant staff, or attempt to access other users’ data. We may suspend accounts that do.</p>
          <h2>6. Liability</h2>
          <p>Nothing in these terms limits rights you have under the Consumer Protection Act, 2019. Subject to that, our liability for an order is limited to the amount you paid for it.</p>
          <h2>7. Disputes</h2>
          <p>Contact support or the grievance officer first. These terms are governed by the laws of India.</p>
        </>
      );
    case "privacy":
      return (
        <>
          <p>{entity} is the data fiduciary for personal data you give us, under the Digital Personal Data Protection Act, 2023.</p>
          <h2>What we collect and why</h2>
          <ul>
            <li><b>Account details</b> (name, email, mobile) — to sign you in and contact you about orders.</li>
            <li><b>Delivery addresses and location</b> — to show restaurants that deliver to you and to deliver orders. Location is used only while you use the app.</li>
            <li><b>Order history and ratings</b> — to fulfil orders, provide receipts, handle refunds and improve recommendations.</li>
            <li><b>Delivery partners’ live location</b> — during an active trip only, to show customers where their order is.</li>
            <li><b>Support conversations and call records</b> (who called whom about which order; not call audio) — to resolve issues and prevent abuse.</li>
          </ul>
          <h2>Who we share it with</h2>
          <p>The restaurant and delivery partner handling your order receive only what they need (items, delivery address). Phone calls between you and the delivery partner are connected through a masked number. Service providers we use: Clerk (sign-in), Razorpay (payments), Upstash (caching), Mapbox (maps), Fast2SMS and Brevo (messages). We do not sell personal data.</p>
          <h2>Retention</h2>
          <p>Account data is kept while your account is active. Order and invoice records are retained for 8 years as required by tax law, in anonymised form if you delete your account.</p>
          <h2>Your rights</h2>
          <p>You can download your data and delete your account from <Link href="/account?tab=profile">Account → Profile</Link>. You may also request correction or raise a grievance with our grievance officer; if unresolved you may complain to the Data Protection Board of India.</p>
        </>
      );
    case "refunds":
      return (
        <>
          <h2>Cancelling an order</h2>
          <ul>
            <li>You can cancel for free, with a full refund, until the restaurant accepts your order (usually within 90 seconds).</li>
            <li>Once the restaurant starts preparing your food, the order can no longer be cancelled from the app. Contact support if something has gone wrong.</li>
          </ul>
          <h2>Automatic refunds</h2>
          <ul>
            <li>If the restaurant rejects your order, does not respond within 90 seconds, or cancels after accepting, you receive a full refund automatically.</li>
            <li>If you are charged twice, or a payment completes after the order was cancelled, the extra amount is refunded automatically.</li>
          </ul>
          <h2>Issues with a delivered order</h2>
          <p>Use “Get help” on the order within 24 hours for missing, wrong or poor-quality items. Our team may offer a partial or full refund depending on the issue.</p>
          <h2>Refund timelines</h2>
          <p>Refunds go back to your original payment method. UPI and wallets usually reflect within 1–3 working days; cards and net banking within 5–7 working days. You will receive a GST credit note for refunds on invoiced orders.</p>
        </>
      );
    case "grievance":
      return (
        <>
          <p>In accordance with the Consumer Protection (E-Commerce) Rules, 2020 and the Information Technology Rules, 2021:</p>
          <dl className="my-6 grid grid-cols-[auto_1fr] gap-x-8 gap-y-3">
            <dt>Grievance Officer</dt>
            <dd>{e.GRIEVANCE_OFFICER_NAME}</dd>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${e.GRIEVANCE_OFFICER_EMAIL}`}>{e.GRIEVANCE_OFFICER_EMAIL}</a>
            </dd>
            <dt>Company</dt>
            <dd>{entity}</dd>
            <dt>Address</dt>
            <dd>{e.PLATFORM_ADDRESS}</dd>
          </dl>
          <p>We acknowledge complaints within 48 hours and resolve them within one month of receipt. For order issues, the fastest route is “Get help” on the order or <Link href="/support">Help & support</Link>.</p>
        </>
      );
  }
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!(doc in DOCS)) notFound();
  const env = getServerEnv();
  const unconfigured = !env.PLATFORM_GSTIN || env.GRIEVANCE_OFFICER_NAME.includes("not configured");
  return (
    <article className="page-narrow pb-20 pt-10 text-[15px] leading-relaxed text-ink-soft sm:pt-16 [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-4 [&_b]:font-medium [&_b]:text-ink [&_dd]:text-ink [&_dt]:text-ink-muted [&_h2]:mb-3 [&_h2]:mt-12 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink [&_li]:my-2 [&_p]:my-4 [&_ul]:list-disc [&_ul]:pl-5">
      {unconfigured && (
        <p className="notice notice-warn !mb-10 !mt-0">Template: company details aren&apos;t configured on this server. Have counsel review this page before launch.</p>
      )}
      <p className="eyebrow !my-0">Legal</p>
      <h1 className="h-page mt-3">{DOCS[doc as Doc]}</h1>
      <p className="!mt-2 text-sm text-ink-muted">Applies to orders placed in India.</p>
      <div className="mt-10">
        <Body doc={doc as Doc} e={env} />
      </div>
      <nav className="mt-16 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-8 text-sm [&_a]:no-underline" aria-label="Legal documents">
        {(Object.keys(DOCS) as Doc[]).map((d) => (
          <Link key={d} href={`/legal/${d}`} aria-current={d === doc ? "page" : undefined} className={d === doc ? "!text-ink" : "!font-normal !text-ink-muted hover:!text-ink"}>
            {DOCS[d]}
          </Link>
        ))}
      </nav>
    </article>
  );
}
