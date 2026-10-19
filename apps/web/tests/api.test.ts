import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as getHealth } from "../src/app/api/v1/health/route.js";
import { POST as checkServiceability } from "../src/app/api/v1/serviceability/check/route.js";
import { GET as getRestaurants } from "../src/app/api/v1/restaurants/route.js";
import { GET as getRestaurantBySlug } from "../src/app/api/v1/restaurants/[slug]/route.js";
import { GET as searchApi } from "../src/app/api/v1/search/route.js";

describe("Web API Endpoints Integration Suite", () => {
  it("GET /api/v1/health returns healthy status", async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.status).toBe("healthy");
    expect(body.meta.timestamp).toBeDefined();
  });

  it("POST /api/v1/serviceability/check returns serviceable for Connaught Place", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/serviceability/check", {
      method: "POST",
      body: JSON.stringify({
        latitude: 28.6315,
        longitude: 77.2167,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await checkServiceability(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isServiceable).toBe(true);
    expect(body.data.zoneId).toBeDefined();
  });

  it("POST /api/v1/serviceability/check returns not serviceable for coordinates outside zone", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/serviceability/check", {
      method: "POST",
      body: JSON.stringify({
        latitude: 19.076, // Mumbai
        longitude: 72.8777,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await checkServiceability(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isServiceable).toBe(false);
  });

  it("GET /api/v1/restaurants lists seeded restaurants", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurants?lat=28.6315&lng=77.2167");
    const res = await getRestaurants(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    const restaurant = body.data[0];
    expect(restaurant.name).toBeDefined();
    expect(restaurant.slug).toBeDefined();
    expect(restaurant.avgPriceForOnePaise).toBeGreaterThan(0);
  });

  it("GET /api/v1/restaurants/[slug] returns full menu and categories", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurants/punjabi-angithi");
    const res = await getRestaurantBySlug(req, {
      params: Promise.resolve({ slug: "punjabi-angithi" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Punjabi Angithi");
    expect(Array.isArray(body.data.categories)).toBe(true);
    expect(body.data.categories.length).toBeGreaterThan(0);

    const firstCategory = body.data.categories[0];
    expect(firstCategory.items.length).toBeGreaterThan(0);
    const firstItem = firstCategory.items[0];
    expect(firstItem.pricePaise).toBeGreaterThan(0);
  });

  it("GET /api/v1/search finds matching restaurants and dishes", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/search?q=dal");
    const res = await searchApi(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.restaurants)).toBe(true);
    expect(Array.isArray(body.data.dishes)).toBe(true);
    expect(body.data.dishes.length).toBeGreaterThan(0);
    expect(body.data.dishes[0].dish.name.toLowerCase()).toContain("dal");
  });
});
