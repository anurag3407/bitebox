import { NextRequest } from "next/server";
import { isDomainError } from "@startup/core";
import { apiError } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { resolveOrderViewer } from "@/server/order-access";
import { assertUuid } from "@/server/route";
import { buildTrackingSnapshot } from "@/server/tracking";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 3000;
const HEARTBEAT_MS = 15_000;
// Connections are recycled so instances can drain during deploys; clients reconnect
const MAX_STREAM_MS = 10 * 60 * 1000;

/**
 * Server-Sent Events stream of tracking snapshots. Each instance polls the shared
 * stores (Postgres + Upstash), so any replica can serve any subscriber without
 * sticky sessions or pub/sub. Only changed snapshots are sent.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  let orderId: string;
  let viewer: Awaited<ReturnType<typeof resolveOrderViewer>>;
  try {
    const auth = await requireAuth(req);
    orderId = assertUuid((await params).orderId, "order");
    viewer = await resolveOrderViewer(auth, orderId);
  } catch (err) {
    if (isDomainError(err)) return apiError(err.code, err.message, err.httpStatus);
    return apiError("INTERNAL_ERROR", "Something went wrong", 500);
  }

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now();
      let lastPayload = "";
      let lastSentAt = 0;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      req.signal.addEventListener("abort", close);

      send(`retry: 3000\n\n`);
      const tick = async () => {
        if (closed) return;
        try {
          const snapshot = await buildTrackingSnapshot(orderId, viewer);
          if (!snapshot) {
            send(`event: gone\ndata: {}\n\n`);
            return close();
          }
          const payload = JSON.stringify(snapshot);
          if (payload !== lastPayload) {
            send(`event: snapshot\ndata: ${payload}\n\n`);
            lastPayload = payload;
            lastSentAt = Date.now();
          } else if (Date.now() - lastSentAt > HEARTBEAT_MS) {
            send(`: heartbeat\n\n`);
            lastSentAt = Date.now();
          }
          if (snapshot.isTerminal || Date.now() - started > MAX_STREAM_MS) return close();
        } catch {
          send(`: transient error\n\n`);
        }
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      };
      await tick();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
