/**
 * Runs once before the suite: applies migrations and loads deterministic fixtures
 * into the test database. Refuses to touch a database whose name does not look
 * like a test database, so a misconfigured DATABASE_URL cannot wipe real data.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL ?? "";
  const dbName = url.split("/").pop()?.split("?")[0] ?? "";
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run tests against non-test database "${dbName}". Set TEST_DATABASE_URL.`);
  }
  const { runMigrations } = await import("../src/migrate.js");
  const { runSeeds } = await import("../src/seeds/seed.js");
  const { closeDbPool, getDbPool } = await import("../src/client.js");
  const { SEED_IDS } = await import("../src/seeds/seed.js");
  await runMigrations({ log: () => undefined });
  await runSeeds();
  // Tests add addresses to the fixture customer; drop leftovers from earlier runs so the
  // per-user address cap is never reached and the seeded address stays the default
  await getDbPool().query(
    `UPDATE customer_addresses SET deleted_at = NOW(), is_default = false WHERE user_id = $1 AND id <> $2 AND deleted_at IS NULL`,
    [SEED_IDS.customerUserId, SEED_IDS.customerAddressId]
  );
  await getDbPool().query(`UPDATE customer_addresses SET is_default = true WHERE id = $1`, [SEED_IDS.customerAddressId]);
  await closeDbPool();
}
