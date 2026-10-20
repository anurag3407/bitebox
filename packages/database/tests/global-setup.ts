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
  const { closeDbPool } = await import("../src/client.js");
  await runMigrations({ log: () => undefined });
  await runSeeds();
  await closeDbPool();
}
