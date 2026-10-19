import { describe, expect, it } from "vitest";
import {
  CoordinateSchema,
  CreateAddressRequestSchema,
  CreateCheckoutRequestSchema,
  CreateQuoteRequestSchema,
  FulfillmentState,
  OrderSummaryDtoSchema,
  PaymentStatus,
  RefundStatus,
  RestaurantSummaryDtoSchema,
  ServiceabilityCheckResponseSchema,
  UserRole,
} from "../src/index.js";

describe("Contracts & DTOs Validation", () => {
  it("validates coordinate schemas", () => {
    const validCoord = { latitude: 28.6139, longitude: 77.209 };
    expect(CoordinateSchema.safeParse(validCoord).success).toBe(true);

    const invalidCoord = { latitude: 100, longitude: 77.209 };
    expect(CoordinateSchema.safeParse(invalidCoord).success).toBe(false);
  });

  it("validates create quote request schema", () => {
    const valid = {
      restaurantId: "11111111-1111-4111-a111-111111111111",
      destinationLocation: { latitude: 28.6139, longitude: 77.209 },
      items: [
        {
          menuItemId: "22222222-2222-4222-a222-222222222222",
          selectedOptionIds: [],
          quantity: 2,
        },
      ],
      couponCode: "WELCOME50",
    };
    expect(CreateQuoteRequestSchema.safeParse(valid).success).toBe(true);

    // Quantity <= 0 should fail
    const invalidQuantity = {
      ...valid,
      items: [{ ...valid.items[0], quantity: 0 }],
    };
    expect(CreateQuoteRequestSchema.safeParse(invalidQuantity).success).toBe(false);
  });

  it("validates checkout idempotency key constraints", () => {
    const validCheckout = {
      quoteId: "11111111-1111-4111-a111-111111111111",
      deliveryAddressId: "22222222-2222-4222-a222-222222222222",
      idempotencyKey: "idem_checkout_key_unique_12345",
    };
    expect(CreateCheckoutRequestSchema.safeParse(validCheckout).success).toBe(true);

    // Too short idempotency key
    const shortKey = { ...validCheckout, idempotencyKey: "short" };
    expect(CreateCheckoutRequestSchema.safeParse(shortKey).success).toBe(false);
  });

  it("validates restaurant summary dto schema", () => {
    const validRestaurant = {
      id: "11111111-1111-4111-a111-111111111111",
      slug: "punjabi-dhaba",
      name: "Punjabi Dhaba",
      cuisines: ["North Indian", "Tandoor"],
      rating: 4.5,
      ratingCount: 320,
      avgPriceForOnePaise: 25000,
      deliveryTimeMinMinutes: 25,
      deliveryTimeMaxMinutes: 35,
      distanceMeters: 2400,
      isAcceptingOrders: true,
      isOpen: true,
      pureVeg: false,
      offerTag: "20% OFF UPTO ₹50",
    };
    expect(RestaurantSummaryDtoSchema.safeParse(validRestaurant).success).toBe(true);
  });
});
