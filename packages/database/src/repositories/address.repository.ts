import { and, desc, eq } from "drizzle-orm";
import { AddressDto, CreateAddressRequest } from "@startup/contracts";
import { getDb } from "../client.js";
import { customerAddresses } from "../schema/schema.js";

export class AddressRepository {
  static async listByUser(userId: string): Promise<AddressDto[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.userId, userId))
      .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.createdAt));

    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      building: r.building,
      street: r.street,
      landmark: r.landmark ?? undefined,
      latitude: r.latitude,
      longitude: r.longitude,
      isDefault: r.isDefault,
      contactPhone: r.contactPhone ?? undefined,
    }));
  }

  static async findById(id: string): Promise<(AddressDto & { userId: string }) | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.id, id))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      userId: row.userId,
      label: row.label,
      building: row.building,
      street: row.street,
      landmark: row.landmark ?? undefined,
      latitude: row.latitude,
      longitude: row.longitude,
      isDefault: row.isDefault,
      contactPhone: row.contactPhone ?? undefined,
    };
  }

  static async create(userId: string, data: CreateAddressRequest): Promise<AddressDto> {
    const db = getDb();

    // If marked default, unset other defaults for this user
    if (data.isDefault) {
      await db
        .update(customerAddresses)
        .set({ isDefault: false })
        .where(eq(customerAddresses.userId, userId));
    }

    const [created] = await db
      .insert(customerAddresses)
      .values({
        userId,
        label: data.label,
        building: data.building,
        street: data.street,
        landmark: data.landmark,
        latitude: data.latitude,
        longitude: data.longitude,
        isDefault: data.isDefault,
        contactPhone: data.contactPhone,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to insert customer address");
    }

    return {
      id: created.id,
      label: created.label,
      building: created.building,
      street: created.street,
      landmark: created.landmark ?? undefined,
      latitude: created.latitude,
      longitude: created.longitude,
      isDefault: created.isDefault,
      contactPhone: created.contactPhone ?? undefined,
    };
  }

  static async setDefault(userId: string, addressId: string): Promise<void> {
    const db = getDb();
    await db
      .update(customerAddresses)
      .set({ isDefault: false })
      .where(eq(customerAddresses.userId, userId));

    await db
      .update(customerAddresses)
      .set({ isDefault: true })
      .where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.id, addressId)));
  }

  static async delete(userId: string, addressId: string): Promise<void> {
    const db = getDb();
    await db
      .delete(customerAddresses)
      .where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.id, addressId)));
  }
}
