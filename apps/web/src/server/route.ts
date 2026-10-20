import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodTypeAny, z } from "zod";
import { DomainError, isDomainError } from "@startup/core";
import { apiError } from "./api-response";
import { logger } from "./logger";

export interface RouteContext<P> {
  params: Promise<P>;
}

type Handler<P> = (req: NextRequest, ctx: RouteContext<P>, requestId: string) => Promise<Response>;

/**
 * Wraps a route handler with request ids, typed error mapping and access logging.
 * DomainErrors carry user-safe messages; anything else is logged and returned as a
 * generic 500 so stack traces and SQL never leak to clients.
 */
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    // Tests and internal callers may invoke param-less handlers without a context
    ctx = ctx ?? { params: Promise.resolve({} as P) };
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const started = Date.now();
    let response: Response;
    try {
      response = await handler(req, ctx, requestId);
    } catch (err) {
      response = toErrorResponse(err, requestId, req);
    }
    response.headers.set("x-request-id", requestId);
    const ms = Date.now() - started;
    if (response.status >= 500 || ms > 1500) {
      logger.warn("request", { requestId, method: req.method, path: new URL(req.url).pathname, status: response.status, ms });
    }
    return response;
  };
}

function toErrorResponse(err: unknown, requestId: string, req: NextRequest): NextResponse {
  if (isDomainError(err)) {
    const headers: Record<string, string> = {};
    const retryAfter = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    if (err.code === "RATE_LIMITED" && retryAfter) headers["Retry-After"] = String(retryAfter);
    return apiError(err.code, err.message, err.httpStatus, err.details, { requestId, headers });
  }
  if (err instanceof ZodError) {
    return apiError("VALIDATION_ERROR", "Invalid request", 400, err.flatten(), { requestId });
  }
  if (err instanceof SyntaxError) {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON", 400, undefined, { requestId });
  }
  logger.error("unhandled route error", {
    requestId,
    method: req.method,
    path: new URL(req.url).pathname,
    error: (err as Error)?.message,
    stack: (err as Error)?.stack?.split("\n").slice(0, 6).join(" | "),
  });
  return apiError("INTERNAL_ERROR", "Something went wrong. Please try again.", 500, undefined, { requestId });
}

/** Parses and validates a JSON body; invalid input becomes a 400 VALIDATION_ERROR. */
export async function parseBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  const text = await req.text();
  if (text.length > 64_000) throw new DomainError("VALIDATION_ERROR", "Request body too large");
  const json = text ? JSON.parse(text) : {};
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request", {
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid query", {
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUuid(value: string | undefined, name = "id"): string {
  if (!value || !UUID_RE.test(value)) throw new DomainError("NOT_FOUND", `Unknown ${name}`);
  return value;
}
