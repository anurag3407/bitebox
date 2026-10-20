import { NextResponse } from "next/server";
import { ErrorCode } from "@startup/contracts";

function meta(requestId?: string) {
  return { requestId: requestId ?? crypto.randomUUID(), timestamp: new Date().toISOString() };
}

export function apiSuccess<T>(data: T, status = 200, init: { requestId?: string; headers?: HeadersInit } = {}) {
  return NextResponse.json(
    { data, meta: meta(init.requestId) },
    { status, headers: { "Cache-Control": "no-store", ...init.headers } }
  );
}

export function apiError(
  code: ErrorCode,
  message: string,
  status = 400,
  details?: unknown,
  init: { requestId?: string; headers?: HeadersInit } = {}
) {
  return NextResponse.json(
    { error: { code, message, details }, meta: meta(init.requestId) },
    { status, headers: { "Cache-Control": "no-store", ...init.headers } }
  );
}
