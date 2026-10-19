import { NextRequest } from "next/server";
import { CreateAddressRequestSchema } from "@startup/contracts";
import { AddressRepository } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHENTICATED", "Authentication required", 401);
    }

    const user = await getOrCreateDbUser(actor);
    const addresses = await AddressRepository.listByUser(user.id);
    return apiSuccess(addresses);
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to fetch addresses", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHENTICATED", "Authentication required", 401);
    }

    const body = await req.json();
    const parsed = CreateAddressRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid address details", 400, parsed.error.format());
    }

    const user = await getOrCreateDbUser(actor);
    const created = await AddressRepository.create(user.id, parsed.data);
    return apiSuccess(created, 201);
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to create address", 500);
  }
}
