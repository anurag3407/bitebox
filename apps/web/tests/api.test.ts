import { describe, expect, it } from "vitest";
import { SEED_IDS } from "@startup/database";
import { call, createCustomerWithAddress, createUser } from "./helpers.js";
import { GET as getHealth } from "../src/app/api/v1/health/route.js";
import { GET as getReady } from "../src/app/api/v1/health/ready/route.js";
import { POST as checkServiceability } from "../src/app/api/v1/serviceability/check/route.js";
import { GET as getRestaurants } from "../src/app/api/v1/restaurants/route.js";
import { GET as getRestaurantBySlug } from "../src/app/api/v1/restaurants/[slug]/route.js";
import { GET as searchApi } from "../src/app/api/v1/search/route.js";
import { GET as getCoupons } from "../src/app/api/v1/coupons/route.js";
import { PUT as addFavorite } from "../src/app/api/v1/favorites/[restaurantId]/route.js";
import { GET as listFavorites } from "../src/app/api/v1/favorites/route.js";
import { GET as listAddresses, POST as createAddress } from "../src/app/api/v1/addresses/route.js";
import { DELETE as deleteAddress } from "../src/app/api/v1/addresses/[addressId]/route.js";

const CP = { latitude: 28.6315, longitude: 77.2167 };

describe("Discovery & account API", () => {
  it("reports liveness and readiness", async () => {
    expect((await getHealth()).status).toBe(200);
    const ready = await getReady();
    expect(ready.status).toBe(200);
    expect((await ready.json()).checks.database.ok).toBe(true);
  });

  it("checks zone serviceability", async () => {
    const inside = await call(checkServiceability, "POST", "/s", { body: CP });
    expect(inside.body.data.isServiceable).toBe(true);
    const outside = await call(checkServiceability, "POST", "/s", { body: { latitude: 19.076, longitude: 72.8777 } });
    expect(outside.body.data.isServiceable).toBe(false);
  });

  it("lists only restaurants that deliver to the location, nearest first, with distance-based ETAs", async () => {
    const res = await call(getRestaurants, "GET", `/r?latitude=${CP.latitude}&longitude=${CP.longitude}&sortBy=distance`);
    expect(res.status).toBe(200);
    const list = res.body.data.restaurants;
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.every((r: any) => r.isServiceable)).toBe(true);
    const open = list.filter((r: any) => r.isAcceptingOrders);
    for (let i = 1; i < open.length; i++) expect(open[i].distanceMeters).toBeGreaterThanOrEqual(open[i - 1].distanceMeters);

    const far = await call(getRestaurants, "GET", `/r?latitude=19.076&longitude=72.8777`);
    expect(far.body.data.restaurants).toHaveLength(0);
  });

  it("filters pure-veg restaurants and paginates", async () => {
    const veg = await call(getRestaurants, "GET", `/r?pureVeg=true&latitude=${CP.latitude}&longitude=${CP.longitude}`);
    expect(veg.body.data.restaurants.every((r: any) => r.pureVeg)).toBe(true);
    const page = await call(getRestaurants, "GET", `/r?limit=1`);
    expect(page.body.data.restaurants).toHaveLength(1);
    expect(page.body.data.nextOffset).toBe(1);
  });

  it("serves the full menu hierarchy and 404s unknown slugs", async () => {
    const res = await call(getRestaurantBySlug, "GET", "/r", { params: { slug: "punjabi-angithi" } });
    expect(res.body.data.categories.length).toBeGreaterThanOrEqual(3);
    const dal = res.body.data.categories.flatMap((c: any) => c.items).find((i: any) => i.name.startsWith("Dal Makhani"));
    expect(dal.variants).toHaveLength(2);
    expect((await call(getRestaurantBySlug, "GET", "/r", { params: { slug: "../etc/passwd" } })).status).toBe(404);
  });

  it("searches dishes and cuisines", async () => {
    const dish = await call(searchApi, "GET", "/api/v1/search?q=tikka");
    expect(dish.body.data.dishes.length).toBeGreaterThan(0);
    const cuisine = await call(searchApi, "GET", "/api/v1/search?q=south%20indian");
    expect(cuisine.body.data.restaurants.map((r: any) => r.slug)).toContain("dosa-plaza-express");
  });

  it("lists available coupons", async () => {
    const res = await call(getCoupons, "GET", "/c");
    expect(res.body.data.map((c: any) => c.code)).toEqual(expect.arrayContaining(["WELCOME50", "FREEDEL"]));
  });

  it("manages favourites and the address book (soft delete keeps history intact)", async () => {
    const user = await createCustomerWithAddress();
    await call(addFavorite, "PUT", "/f", { token: user.token, params: { restaurantId: SEED_IDS.restaurant2Id } });
    const favs = await call(listFavorites, "GET", "/f", { token: user.token });
    expect(favs.body.data.map((r: any) => r.id)).toEqual([SEED_IDS.restaurant2Id]);

    const created = await call(createAddress, "POST", "/a", {
      token: user.token,
      body: { label: "Work", building: "Tower B", street: "Janpath", latitude: 28.62, longitude: 77.21, isDefault: true, contactPhone: "9876543210" },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.contactPhone).toBe("+919876543210");
    let list = await call(listAddresses, "GET", "/a", { token: user.token });
    expect(list.body.data.filter((a: any) => a.isDefault)).toHaveLength(1);

    await call(deleteAddress, "DELETE", "/a", { token: user.token, params: { addressId: created.body.data.id } });
    list = await call(listAddresses, "GET", "/a", { token: user.token });
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].isDefault).toBe(true); // the remaining address was promoted

    const bad = await call(createAddress, "POST", "/a", {
      token: user.token,
      body: { label: "X", building: "Y", street: "Z", latitude: 28.6, longitude: 77.2, contactPhone: "12345" },
    });
    expect(bad.status).toBe(400);
  });

  it("requires sign-in for account data", async () => {
    expect((await call(listAddresses, "GET", "/a")).status).toBe(401);
    const merchant = await createUser("MERCHANT_STAFF");
    expect((await call(listAddresses, "GET", "/a", { token: merchant.token })).status).toBe(200);
  });
});
