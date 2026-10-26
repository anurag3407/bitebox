import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { getServerEnv, isStrictEnvironment } from "@startup/config";
import { getDbPool } from "../client.js";

export const SEED_IDS = {
  cityId: "10000000-0000-4000-8000-000000000001",
  zoneId: "20000000-0000-4000-8000-000000000001",
  customerUserId: "30000000-0000-4000-8000-000000000001",
  merchantUserId: "30000000-0000-4000-8000-000000000002",
  riderUserId: "30000000-0000-4000-8000-000000000003",
  adminUserId: "30000000-0000-4000-8000-000000000004",
  customerAddressId: "40000000-0000-4000-8000-000000000001",
  merchantId: "50000000-0000-4000-8000-000000000001",
  restaurant1Id: "60000000-0000-4000-8000-000000000001",
  restaurant2Id: "60000000-0000-4000-8000-000000000002",
  restaurant3Id: "60000000-0000-4000-8000-000000000003",
  riderId: "70000000-0000-4000-8000-000000000001",
};

/** Deterministic UUIDs so re-running the seed never duplicates rows. */
function fixedId(prefix: string, n: number): string {
  return `${prefix}0000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
}

const EVERY_DAY = (open: string, close: string) =>
  Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [[open, close]]]));

interface SeedOption {
  name: string;
  pricePaise: number;
}
interface SeedItem {
  id: number;
  name: string;
  description: string;
  pricePaise: number;
  dietaryTag: "VEG" | "NON_VEG" | "EGG" | "VEGAN";
  imageUrl: string;
  bestseller?: boolean;
  allergens?: string[];
  nutrition?: { calories?: number; proteinG?: number; carbsG?: number; fatG?: number };
  spiceLevel?: number;
  serves?: number;
  variants?: SeedOption[];
  modifiers?: Array<{ id: number; name: string; min: number; max: number; required: boolean; options: SeedOption[] }>;
}
interface SeedCategory {
  id: number;
  name: string;
  items: SeedItem[];
}
interface SeedRestaurant {
  id: string;
  name: string;
  slug: string;
  cuisines: string[];
  rating: number;
  ratingCount: number;
  avgPriceForOnePaise: number;
  latitude: number;
  longitude: number;
  addressText: string;
  phone: string;
  pureVeg: boolean;
  heroImageUrl: string;
  offerTag: string | null;
  amenities?: string[];
  gallery?: string[];
  openingHours: Record<string, string[][]> | null;
  avgPrepMinutes: number;
  categories: SeedCategory[];
}

const img = (id: string, w = 600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const RESTAURANTS: SeedRestaurant[] = [
  {
    id: SEED_IDS.restaurant1Id,
    name: "Punjabi Angithi",
    slug: "punjabi-angithi",
    cuisines: ["North Indian", "Tandoor", "Biryani"],
    rating: 4.5,
    ratingCount: 342,
    avgPriceForOnePaise: 25000,
    latitude: 28.6328,
    longitude: 77.2197,
    addressText: "Outer Circle, Connaught Place, New Delhi",
    phone: "+911145678901",
    pureVeg: false,
    heroImageUrl: img("photo-1589302168068-964664d93dc0", 800),
    offerTag: "20% OFF UPTO ₹50",
    amenities: ["Outdoor seating", "Card accepted", "Family friendly", "Parking"],
    gallery: [
      img("photo-1589302168068-964664d93dc0", 900),
      img("photo-1599487488170-d11ec9c172f0", 900),
      img("photo-1626777552726-4a6b54c97e46", 900),
    ],
    // Open around the clock so automated tests are time-of-day independent
    openingHours: null,
    avgPrepMinutes: 18,
    categories: [
      {
        id: 1,
        name: "Tandoori Starters & Kebabs",
        items: [
          {
            id: 1,
            name: "Paneer Tikka Shashlik",
            description: "Fresh cottage cheese marinated in hung curd, Kashmiri spices, and char-grilled with capsicum and onions.",
            pricePaise: 28000,
            dietaryTag: "VEG",
            imageUrl: img("photo-1599487488170-d11ec9c172f0"),
            bestseller: true,
            allergens: ["Milk"],
            nutrition: { calories: 320, proteinG: 18, carbsG: 14, fatG: 21 },
            spiceLevel: 2,
            serves: 1,
          },
          {
            id: 2,
            name: "Murgh Malai Tikka",
            description: "Tender boneless chicken morsels infused with creamy cheese, cardamom, and gentle spices.",
            pricePaise: 34000,
            dietaryTag: "NON_VEG",
            imageUrl: img("photo-1626777552726-4a6b54c97e46"),
            allergens: ["Milk"],
            nutrition: { calories: 380, proteinG: 32, carbsG: 8, fatG: 24 },
            spiceLevel: 1,
            serves: 1,
            modifiers: [
              {
                id: 1,
                name: "Choice of Dip",
                min: 1,
                max: 1,
                required: true,
                options: [
                  { name: "Mint Chutney (Default)", pricePaise: 0 },
                  { name: "Garlic Mayo Dip", pricePaise: 3000 },
                  { name: "Extra Spicy Peri-Peri Dip", pricePaise: 4000 },
                ],
              },
            ],
          },
          {
            id: 3,
            name: "Tandoori Soya Chaap",
            description: "Soya chaap skewers slow-cooked in charcoal clay oven with tandoori spices.",
            pricePaise: 25000,
            dietaryTag: "VEG",
            imageUrl: img("photo-1601050690597-df0568f70950"),
          },
        ],
      },
      {
        id: 2,
        name: "Main Course Gravies",
        items: [
          {
            id: 4,
            name: "Dal Makhani (Signature)",
            description: "Slow cooked for 24 hours on slow charcoal, finished with white butter and fresh cream.",
            pricePaise: 29000,
            dietaryTag: "VEG",
            imageUrl: img("photo-1546833999-b9f581a1996d"),
            bestseller: true,
            variants: [
              { name: "Half Portion (500ml)", pricePaise: 29000 },
              { name: "Full Portion (800ml)", pricePaise: 48000 },
            ],
          },
          {
            id: 5,
            name: "Butter Chicken Delhi Style",
            description: "Tandoori shredded chicken simmered in a velvety aromatic tomato and cashew gravy.",
            pricePaise: 39000,
            dietaryTag: "NON_VEG",
            imageUrl: img("photo-1603894584373-5ac82b2ae398"),
            bestseller: true,
          },
        ],
      },
      {
        id: 3,
        name: "Fresh Tandoori Breads & Biryani",
        items: [
          {
            id: 6,
            name: "Butter Garlic Naan",
            description: "Leavened bread from the clay oven brushed with garlic butter.",
            pricePaise: 7000,
            dietaryTag: "VEG",
            imageUrl: img("photo-1565557623262-b51c2513a641"),
          },
          {
            id: 7,
            name: "Lucknowi Chicken Dum Biryani",
            description: "Fragrant basmati layered with saffron, fried onions and tender chicken, sealed and slow-cooked.",
            pricePaise: 36000,
            dietaryTag: "NON_VEG",
            imageUrl: img("photo-1563379091339-03b21ab4a4f8"),
            modifiers: [
              {
                id: 2,
                name: "Add-ons",
                min: 0,
                max: 3,
                required: false,
                options: [
                  { name: "Extra Raita", pricePaise: 4000 },
                  { name: "Boiled Egg", pricePaise: 2500 },
                  { name: "Mirchi Ka Salan", pricePaise: 5000 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: SEED_IDS.restaurant2Id,
    name: "Bikanervala Sweets & Chaat",
    slug: "bikanervala-sweets",
    cuisines: ["Mithai", "Street Food", "North Indian", "Chaat"],
    rating: 4.4,
    ratingCount: 610,
    avgPriceForOnePaise: 20000,
    latitude: 28.6298,
    longitude: 77.2155,
    addressText: "Radha Cinema Complex, CP, New Delhi",
    phone: "+911145678902",
    pureVeg: true,
    heroImageUrl: img("photo-1601050690597-df0568f70950", 800),
    offerTag: "FLAT ₹30 OFF",
    openingHours: EVERY_DAY("08:00", "23:00"),
    avgPrepMinutes: 12,
    categories: [
      {
        id: 4,
        name: "Chaat Corner",
        items: [
          {
            id: 8,
            name: "Raj Kachori",
            description: "Crisp kachori stuffed with moong, potato, sprouts, curd and tangy chutneys.",
            pricePaise: 16000,
            dietaryTag: "VEG",
            imageUrl: img("photo-1606491956689-2ea866880c84"),
            bestseller: true,
          },
          {
            id: 9,
            name: "Pani Puri (8 pcs)",
            description: "Hollow puris with spiced potato and chilled mint-tamarind water on the side.",
            pricePaise: 9000,
            dietaryTag: "VEG",
            imageUrl: img("photo-1601050690597-df0568f70950"),
          },
        ],
      },
      {
        id: 5,
        name: "Meals & Mithai",
        items: [
          {
            id: 10,
            name: "Chole Bhature",
            description: "Two fluffy bhaturas with Amritsari chole, pickle and onions.",
            pricePaise: 19000,
            dietaryTag: "VEG",
            imageUrl: img("photo-1626132647523-66f5bf380027"),
            bestseller: true,
          },
          {
            id: 11,
            name: "Kaju Katli",
            description: "Classic cashew fudge with silver vark.",
            pricePaise: 25000,
            dietaryTag: "VEG",
            imageUrl: img("photo-1605197788044-5a32c7078486"),
            variants: [
              { name: "250 g", pricePaise: 25000 },
              { name: "500 g", pricePaise: 48000 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: SEED_IDS.restaurant3Id,
    name: "The Burger Club",
    slug: "the-burger-club",
    cuisines: ["Burgers", "Fast Food", "Beverages"],
    rating: 4.3,
    ratingCount: 480,
    avgPriceForOnePaise: 18000,
    latitude: 28.634,
    longitude: 77.221,
    addressText: "Block B, Connaught Place, New Delhi",
    phone: "+911145678903",
    pureVeg: false,
    heroImageUrl: img("photo-1568901346375-23c9450c58cd", 800),
    offerTag: "FREE FRIES ON ₹299",
    // Late-night outlet: the range wraps past midnight
    openingHours: EVERY_DAY("11:00", "03:00"),
    avgPrepMinutes: 12,
    categories: [
      {
        id: 6,
        name: "Burgers",
        items: [
          {
            id: 12,
            name: "Classic Smash Burger",
            description: "Double smashed chicken patty, cheddar, pickles and house sauce in a brioche bun.",
            pricePaise: 24900,
            dietaryTag: "NON_VEG",
            imageUrl: img("photo-1568901346375-23c9450c58cd"),
            bestseller: true,
            modifiers: [
              {
                id: 3,
                name: "Make it a meal",
                min: 0,
                max: 1,
                required: false,
                options: [
                  { name: "Fries + Coke", pricePaise: 9900 },
                  { name: "Peri-Peri Fries + Iced Tea", pricePaise: 11900 },
                ],
              },
            ],
          },
          {
            id: 13,
            name: "Crispy Paneer Burger",
            description: "Panko-crusted paneer slab, slaw and chipotle mayo.",
            pricePaise: 19900,
            dietaryTag: "VEG",
            imageUrl: img("photo-1550547660-d9450f859349"),
          },
        ],
      },
      {
        id: 7,
        name: "Sides & Shakes",
        items: [
          {
            id: 14,
            name: "Loaded Cheese Fries",
            description: "Skin-on fries, cheese sauce, jalapeños.",
            pricePaise: 14900,
            dietaryTag: "VEG",
            imageUrl: img("photo-1573080496219-bb080dd4f877"),
          },
          {
            id: 15,
            name: "Oreo Thick Shake",
            description: "Hand-spun vanilla ice cream blended with Oreo.",
            pricePaise: 16900,
            dietaryTag: "VEG",
            imageUrl: img("photo-1572490122747-3968b75cc699"),
          },
        ],
      },
    ],
  },
  {
    id: fixedId("6", 4),
    name: "Dosa Plaza Express",
    slug: "dosa-plaza-express",
    cuisines: ["South Indian", "Dosa", "Healthy"],
    rating: 4.2,
    ratingCount: 214,
    avgPriceForOnePaise: 15000,
    latitude: 28.6268,
    longitude: 77.2189,
    addressText: "Janpath Market, New Delhi",
    phone: "+911145678904",
    pureVeg: true,
    heroImageUrl: img("photo-1630383249896-424e482df921", 800),
    offerTag: null,
    openingHours: EVERY_DAY("07:00", "22:30"),
    avgPrepMinutes: 10,
    categories: [
      {
        id: 8,
        name: "Dosas & Uttapam",
        items: [
          {
            id: 16,
            name: "Mysore Masala Dosa",
            description: "Crisp dosa with red chutney, potato masala, sambar and coconut chutney.",
            pricePaise: 17000,
            dietaryTag: "VEG",
            imageUrl: img("photo-1630383249896-424e482df921"),
            bestseller: true,
          },
          {
            id: 17,
            name: "Idli Sambar (4 pcs)",
            description: "Steamed rice cakes with sambar and two chutneys.",
            pricePaise: 11000,
            dietaryTag: "VEGAN",
            imageUrl: img("photo-1589301760014-d929f3979dbc"),
          },
        ],
      },
    ],
  },
];

async function seedRestaurant(client: PoolClient, r: SeedRestaurant): Promise<void> {
  await client.query(
    `INSERT INTO restaurants (
       id, merchant_id, city_id, service_zone_id, name, slug, cuisines, rating, rating_count,
       avg_price_for_one_paise, delivery_time_min_minutes, delivery_time_max_minutes,
       latitude, longitude, address_text, phone, is_accepting_orders, is_open, pure_veg, hero_image_url, offer_tag,
       opening_hours, avg_prep_minutes, max_delivery_radius_meters, amenities, gallery_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 25, 35, $11, $12, $13, $14, true, true, $15, $16, $17, $18, $19, 7000, $20, $21)
     ON CONFLICT (id) DO UPDATE SET opening_hours = EXCLUDED.opening_hours, avg_prep_minutes = EXCLUDED.avg_prep_minutes,
       amenities = EXCLUDED.amenities, gallery_json = EXCLUDED.gallery_json`,
    [
      r.id,
      SEED_IDS.merchantId,
      SEED_IDS.cityId,
      SEED_IDS.zoneId,
      r.name,
      r.slug,
      r.cuisines,
      r.rating,
      r.ratingCount,
      r.avgPriceForOnePaise,
      r.latitude,
      r.longitude,
      r.addressText,
      r.phone,
      r.pureVeg,
      r.heroImageUrl,
      r.offerTag,
      r.openingHours ? JSON.stringify(r.openingHours) : null,
      r.avgPrepMinutes,
      r.amenities ?? [],
      JSON.stringify(r.gallery ?? []),
    ]
  );

  for (const [catIndex, cat] of r.categories.entries()) {
    const categoryId = fixedId("8", cat.id);
    await client.query(
      `INSERT INTO menu_categories (id, restaurant_id, name, display_order) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [categoryId, r.id, cat.name, catIndex + 1]
    );

    for (const [itemIndex, item] of cat.items.entries()) {
      const itemId = fixedId("9", item.id);
      await client.query(
        `INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price_paise, dietary_tag,
                                 is_available, image_url, is_bestseller, display_order,
                                 allergens, nutrition_json, spice_level, serves)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET is_bestseller = EXCLUDED.is_bestseller, display_order = EXCLUDED.display_order,
           allergens = EXCLUDED.allergens, nutrition_json = EXCLUDED.nutrition_json,
           spice_level = EXCLUDED.spice_level, serves = EXCLUDED.serves`,
        [
          itemId,
          r.id,
          categoryId,
          item.name,
          item.description,
          item.pricePaise,
          item.dietaryTag,
          item.imageUrl,
          item.bestseller ?? false,
          itemIndex,
          item.allergens ?? [],
          item.nutrition ? JSON.stringify(item.nutrition) : null,
          item.spiceLevel ?? 0,
          item.serves ?? null,
        ]
      );

      for (const [vIndex, variant] of (item.variants ?? []).entries()) {
        await client.query(
          `INSERT INTO item_variants (id, menu_item_id, name, price_paise, is_available) VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (id) DO NOTHING`,
          [fixedId("c", item.id * 10 + vIndex), itemId, variant.name, variant.pricePaise]
        );
      }

      for (const group of item.modifiers ?? []) {
        const groupId = fixedId("a", group.id);
        await client.query(
          `INSERT INTO modifier_groups (id, menu_item_id, name, min_select, max_select, is_required)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
          [groupId, itemId, group.name, group.min, group.max, group.required]
        );
        for (const [oIndex, option] of group.options.entries()) {
          await client.query(
            `INSERT INTO modifier_options (id, group_id, name, price_paise, is_available) VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (id) DO NOTHING`,
            [fixedId("b", group.id * 10 + oIndex), groupId, option.name, option.pricePaise]
          );
        }
      }
    }
  }
}

export async function runSeeds() {
  const env = getServerEnv();
  if (isStrictEnvironment(env) && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error("Refusing to load demo fixtures into a staging/production database.");
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    console.log("Seeding deterministic test data...");
    await client.query("BEGIN");

    // 1. City & Service Zone (Central Delhi / Connaught Place & NCR)
    await client.query(
      `INSERT INTO cities (id, name, slug, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.cityId, "New Delhi", "new-delhi"]
    );

    const zonePolygon = [
      { latitude: 28.55, longitude: 77.15 },
      { latitude: 28.55, longitude: 77.3 },
      { latitude: 28.72, longitude: 77.3 },
      { latitude: 28.72, longitude: 77.15 },
    ];

    await client.query(
      `INSERT INTO service_zones (id, city_id, name, polygon_geojson, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.zoneId, SEED_IDS.cityId, "Central Delhi", JSON.stringify(zonePolygon)]
    );

    // 2. Users (Customer, Merchant Staff, Rider, Admin)
    await client.query(
      `INSERT INTO app_users (id, clerk_user_id, name, email, phone, role)
       VALUES
         ($1, 'user_clerk_customer', 'Rahul Sharma', 'customer@example.com', '+919876543210', 'CUSTOMER'),
         ($2, 'user_clerk_merchant', 'Chef Vikram Anand', 'merchant@example.com', '+919876543211', 'MERCHANT_STAFF'),
         ($3, 'user_clerk_rider', 'Amit Kumar (Delivery Partner)', 'rider@example.com', '+919876543212', 'RIDER'),
         ($4, 'user_clerk_admin', 'Siddharth Operations', 'admin@example.com', '+919876543213', 'ADMIN')
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.customerUserId, SEED_IDS.merchantUserId, SEED_IDS.riderUserId, SEED_IDS.adminUserId]
    );

    // 3. Customer Address
    await client.query(
      `INSERT INTO customer_addresses (id, user_id, label, building, street, landmark, latitude, longitude, is_default, contact_phone)
       VALUES ($1, $2, 'Home', 'Flat 402, Royal Residency', 'Barakhamba Road, Connaught Place', 'Near Metro Station', 28.6315, 77.2167, true, '+919876543210')
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.customerAddressId, SEED_IDS.customerUserId]
    );

    // 4. Merchant
    await client.query(
      `INSERT INTO merchants (id, legal_business_name, fssai_license_number, contact_email, contact_phone, is_verified)
       VALUES ($1, 'Spice Crafters Hospitality Pvt Ltd', '10019011000123', 'partner@spicecrafters.com', '+919876543211', true)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.merchantId]
    );

    // 5. Restaurants, menus, variants and modifiers
    for (const restaurant of RESTAURANTS) {
      await seedRestaurant(client, restaurant);
    }

    // The demo merchant runs the first two outlets
    for (const restaurantId of [SEED_IDS.restaurant1Id, SEED_IDS.restaurant2Id]) {
      await client.query(
        `INSERT INTO merchant_memberships (id, user_id, restaurant_id, staff_role)
         VALUES (gen_random_uuid(), $1, $2, 'OWNER')
         ON CONFLICT (user_id, restaurant_id) DO NOTHING`,
        [SEED_IDS.merchantUserId, restaurantId]
      );
    }

    // 6. Rider Fixture (demo partner is already KYC-verified)
    await client.query(
      `INSERT INTO riders (id, user_id, name, phone, vehicle_type, is_approved, is_online, current_latitude, current_longitude,
                           last_ping_at, verification_status, rating, delivery_count, joined_at)
       VALUES ($1, $2, 'Amit Kumar', '+919876543212', 'MOTORCYCLE', true, true, 28.6320, 77.2180, NOW(),
               'VERIFIED', 4.9, 128, NOW() - interval '180 days')
       ON CONFLICT (id) DO UPDATE SET verification_status = 'VERIFIED', is_approved = true`,
      [SEED_IDS.riderId, SEED_IDS.riderUserId]
    );
    await client.query(
      `INSERT INTO rider_verifications (rider_id, status, aadhaar_last4, pan_verified, dl_verified,
                                        background_check_status, training_completed_at, submitted_at, verified_at)
       VALUES ($1, 'VERIFIED', '4821', true, true, 'CLEAR', NOW() - interval '175 days', NOW() - interval '180 days', NOW() - interval '178 days')
       ON CONFLICT (rider_id) DO UPDATE SET status = 'VERIFIED'`,
      [SEED_IDS.riderId]
    );
    for (const docType of ["PROFILE_PHOTO", "AADHAAR", "DRIVING_LICENSE", "VEHICLE_RC"]) {
      await client.query(
        `INSERT INTO rider_documents (rider_id, doc_type, file_url, status, reviewed_at)
         VALUES ($1, $2, $3, 'VERIFIED', NOW() - interval '178 days')
         ON CONFLICT (rider_id, doc_type) DO NOTHING`,
        [SEED_IDS.riderId, docType, `https://images.bitebox.example/kyc/${docType.toLowerCase()}.jpg`]
      );
    }

    // Demo quests and shift slots so the rider rewards loop is visible
    await client.query(
      `INSERT INTO rider_incentives (id, code, title, description, target_deliveries, reward_paise, starts_at, ends_at, is_active)
       VALUES
         ($1, 'LUNCH-3', 'Lunch rush sprint', 'Complete 3 deliveries between 11am and 4pm today.', 3, 7500,
          date_trunc('day', NOW()) + interval '11 hours', date_trunc('day', NOW()) + interval '16 hours', true),
         ($2, 'WEEK-10', 'Weekly streak', 'Complete 10 deliveries in the next 7 days.', 10, 20000,
          NOW() - interval '1 hour', NOW() + interval '7 days', true)
       ON CONFLICT (code) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description, target_deliveries = EXCLUDED.target_deliveries,
         reward_paise = EXCLUDED.reward_paise, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, is_active = true`,
      [fixedId("f", 1), fixedId("f", 2)]
    );
    await client.query(
      `INSERT INTO rider_shifts (id, label, starts_at, ends_at, capacity, is_active)
       VALUES
         ($1, 'Lunch rush · Connaught Place', date_trunc('day', NOW()) + interval '1 day 11 hours', date_trunc('day', NOW()) + interval '1 day 15 hours', 6, true),
         ($2, 'Dinner peak · Connaught Place', date_trunc('day', NOW()) + interval '1 day 18 hours', date_trunc('day', NOW()) + interval '1 day 23 hours', 8, true),
         ($3, 'Lunch rush · Connaught Place', date_trunc('day', NOW()) + interval '2 days 11 hours', date_trunc('day', NOW()) + interval '2 days 15 hours', 6, true)
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
         capacity = EXCLUDED.capacity, is_active = true`,
      [fixedId("f", 3), fixedId("f", 4), fixedId("f", 5)]
    );

    // 7. Coupons with realistic limits
    await client.query(
      `INSERT INTO coupons (id, code, type, discount_value, max_discount_paise, min_order_paise, is_active,
                            description, usage_limit_per_user, first_order_only)
       VALUES
         ($1, 'WELCOME50', 'PERCENTAGE', 50, 10000, 20000, true, '50% off up to ₹100 on your first order', 1, true),
         ($2, 'FLAT100', 'FLAT', 10000, 10000, 40000, true, 'Flat ₹100 off on orders above ₹400', 3, false),
         ($3, 'BITEBOX20', 'PERCENTAGE', 20, 5000, 15000, true, '20% off up to ₹50', NULL, false),
         ($4, 'FREEDEL', 'FREE_DELIVERY', 0, NULL, 19900, true, 'Free delivery on orders above ₹199', 5, false)
       ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, description = EXCLUDED.description`,
      [fixedId("d", 1), fixedId("d", 2), fixedId("d", 3), fixedId("d", 4)]
    );

    await client.query(
      `UPDATE restaurants SET hygiene_rating = 4 WHERE id = ANY($1::uuid[]) AND hygiene_rating IS NULL`,
      [[SEED_IDS.restaurant1Id, SEED_IDS.restaurant2Id]]
    );

    // 8b. Campus cluster with a drop point and a campus meal plan
    await client.query(
      `INSERT INTO clusters (id, city_id, name, polygon_geojson)
       VALUES ($1, $2, 'IIT Delhi campus', $3::jsonb)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, polygon_geojson = EXCLUDED.polygon_geojson, is_active = true`,
      [
        fixedId("b", 9201),
        SEED_IDS.cityId,
        JSON.stringify([
          { latitude: 28.54, longitude: 77.18 },
          { latitude: 28.56, longitude: 77.18 },
          { latitude: 28.56, longitude: 77.21 },
          { latitude: 28.54, longitude: 77.21 },
        ]),
      ]
    );
    await client.query(
      `INSERT INTO drop_points (id, cluster_id, name, latitude, longitude)
       VALUES ($1, $2, 'Hostel Gate 1', 28.545, 77.192)
       ON CONFLICT (id) DO UPDATE SET cluster_id = EXCLUDED.cluster_id, name = EXCLUDED.name,
         latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
      [fixedId("e", 9201), fixedId("b", 9201)]
    );
    await client.query(
      `INSERT INTO meal_plans
         (id, cluster_id, kitchen_restaurant_id, name, sku_type, total_meals, price_paise, validity_days,
          kitchen_contract_payout_paise, late_skip_fee_paise, auto_schedule_days, slot_window, is_active)
       VALUES ($1, $2, $3, 'Campus 5-lunch pass', 'STANDARD_LUNCH', 5, 39900, 21, 28000, 1500, '{1,2,3,4,5}', '12:30-13:30', true)
       ON CONFLICT (id) DO UPDATE SET cluster_id = EXCLUDED.cluster_id, name = EXCLUDED.name,
         total_meals = EXCLUDED.total_meals, price_paise = EXCLUDED.price_paise, validity_days = EXCLUDED.validity_days,
         kitchen_contract_payout_paise = EXCLUDED.kitchen_contract_payout_paise, late_skip_fee_paise = EXCLUDED.late_skip_fee_paise,
         auto_schedule_days = EXCLUDED.auto_schedule_days, slot_window = EXCLUDED.slot_window, is_active = true`,
      [fixedId("a", 9201), fixedId("b", 9201), SEED_IDS.restaurant1Id]
    );

    // 8b. Demo add-on so active orders offer a one-tap extra
    await client.query(
      `INSERT INTO addon_skus (id, kitchen_id, name, price_paise, cogs_paise, stock_count, is_active)
       VALUES ($1, $2, 'Masala Chaas', 2000, 1000, 20, true)
       ON CONFLICT (id) DO UPDATE SET price_paise = EXCLUDED.price_paise, cogs_paise = EXCLUDED.cogs_paise,
         stock_count = 20, is_active = true, updated_at = NOW()`,
      [fixedId("e", 9102), SEED_IDS.restaurant1Id]
    );

    // 8b. Demo corporate lunch account so members can see their allowance
    await client.query(
      `INSERT INTO clusters (id, city_id, name, polygon_geojson)
       VALUES ($1, $2, 'Connaught Place corporate cluster', $3::jsonb)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, polygon_geojson = EXCLUDED.polygon_geojson, is_active = true`,
      [
        fixedId("b", 9101),
        SEED_IDS.cityId,
        JSON.stringify([
          { latitude: 28.62, longitude: 77.2 },
          { latitude: 28.64, longitude: 77.2 },
          { latitude: 28.64, longitude: 77.23 },
          { latitude: 28.62, longitude: 77.23 },
        ]),
      ]
    );
    await client.query(
      `INSERT INTO drop_points (id, cluster_id, name, latitude, longitude)
       VALUES ($1, $2, 'Northstar Labs lobby', 28.6315, 77.2167)
       ON CONFLICT (id) DO UPDATE SET cluster_id = EXCLUDED.cluster_id, name = EXCLUDED.name,
         latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
      [fixedId("e", 9101), fixedId("b", 9101)]
    );
    await client.query(
      `INSERT INTO corporate_accounts
         (id, company_name, gstin, billing_address, drop_point_id,
          daily_allowance_per_employee_paise, subsidy_percentage_bp, corporate_management_fee_bp, credit_limit_paise)
       VALUES ($1, 'Northstar Labs', '07AAACN1234F1Z8', '12 Barakhamba Road, New Delhi', $2, 20000, 10000, 500, 500000)
       ON CONFLICT (id) DO UPDATE SET company_name = EXCLUDED.company_name,
         drop_point_id = EXCLUDED.drop_point_id,
         daily_allowance_per_employee_paise = EXCLUDED.daily_allowance_per_employee_paise,
         subsidy_percentage_bp = EXCLUDED.subsidy_percentage_bp,
         corporate_management_fee_bp = EXCLUDED.corporate_management_fee_bp,
         credit_limit_paise = EXCLUDED.credit_limit_paise, is_active = true`,
      [fixedId("a", 9101), fixedId("e", 9101)]
    );
    await client.query(
      `INSERT INTO corporate_employees (corporate_account_id, user_id, cost_center_code, email_domain)
       VALUES ($1, $2, 'ENG-01', 'northstar.test')
       ON CONFLICT (corporate_account_id, user_id) DO UPDATE SET cost_center_code = EXCLUDED.cost_center_code, is_active = true`,
      [fixedId("a", 9101), SEED_IDS.customerUserId]
    );

    // 8b. Meal plans so the pass purchase flow is usable out of the box
    await client.query(
      `INSERT INTO meal_plans
         (id, kitchen_restaurant_id, name, sku_type, total_meals, price_paise, validity_days,
          kitchen_contract_payout_paise, late_skip_fee_paise, auto_schedule_days, slot_window, is_active)
       VALUES
         ($1, $3, '3-meal trial lunch pass', 'STANDARD_LUNCH', 3, 29900, 14, 21000, 2000, '{1,2,3,4,5}', '12:30-13:30', true),
         ($2, $3, '10-meal weekday lunch pass', 'STANDARD_LUNCH', 10, 89900, 30, 65000, 2500, '{1,2,3,4,5}', '12:30-13:30', true)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, total_meals = EXCLUDED.total_meals, price_paise = EXCLUDED.price_paise,
         validity_days = EXCLUDED.validity_days, kitchen_contract_payout_paise = EXCLUDED.kitchen_contract_payout_paise,
         late_skip_fee_paise = EXCLUDED.late_skip_fee_paise, auto_schedule_days = EXCLUDED.auto_schedule_days,
         slot_window = EXCLUDED.slot_window, is_active = true`,
      [fixedId("a", 9001), fixedId("a", 9002), SEED_IDS.restaurant1Id]
    );

    // 8. Demo rescue bag so the surplus flow is visible without merchant setup
    await client.query(
      `INSERT INTO surplus_listings
         (id, restaurant_id, title, original_value_paise, sale_price_paise, platform_flat_fee_paise,
          quantity_available, pickup_window_start, pickup_window_end, status)
       VALUES ($1, $2, 'Surprise Tandoori Rescue Bag', 45000, 14900, 1900, 8,
               NOW() - interval '5 minutes', NOW() + interval '8 hours', 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET
         quantity_available = 8, pickup_window_start = EXCLUDED.pickup_window_start,
         pickup_window_end = EXCLUDED.pickup_window_end, status = 'ACTIVE', updated_at = NOW()`,
      [fixedId("e", 1), SEED_IDS.restaurant1Id]
    );

    // 8c. Curated collections for discovery
    await client.query(
      `INSERT INTO collections (id, slug, title, subtitle, description, image_url, display_order, is_active)
       VALUES
         ($1, 'biryani-trail', 'The biryani trail', 'Dum-cooked, charcoal-finished, worth the drive',
          'Three kitchens our reviewers keep returning to for long-grain basmati, saffron and slow-cooked meat. Start with the Lucknowi dum biryani and work your way across the city.',
          $4, 1, true),
         ($2, 'late-night-legends', 'Late-night legends', 'Open when the craving hits at 1am',
          'The kitchens that still pick up after midnight — rolls, burgers and biryani for the after-hours crowd.',
          $5, 2, true),
         ($3, 'connaught-classics', 'Connaught Place classics', 'The old guards of the Outer Circle',
          'A walkable route through the restaurants that made Connaught Place a food destination: tandoori, chaat and everything in between.',
          $6, 3, true)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, description = EXCLUDED.description,
         image_url = EXCLUDED.image_url, display_order = EXCLUDED.display_order, is_active = true`,
      [
        fixedId("f", 1),
        fixedId("f", 2),
        fixedId("f", 3),
        img("photo-1563379091339-03246963d51a", 1200),
        img("photo-1568901346375-23c9450c58cd", 1200),
        img("photo-1552566626-52f8b828add9", 1200),
      ]
    );
    for (const [collectionId, restaurantIds] of [
      [fixedId("f", 1), [SEED_IDS.restaurant1Id, SEED_IDS.restaurant3Id, SEED_IDS.restaurant2Id]],
      [fixedId("f", 2), [SEED_IDS.restaurant3Id, SEED_IDS.restaurant1Id]],
      [fixedId("f", 3), [SEED_IDS.restaurant1Id, SEED_IDS.restaurant2Id, SEED_IDS.restaurant3Id]],
    ] as Array<[string, string[]]>) {
      for (let index = 0; index < restaurantIds.length; index += 1) {
        await client.query(
          `INSERT INTO collection_restaurants (collection_id, restaurant_id, rank)
           VALUES ($1, $2, $3)
           ON CONFLICT (collection_id, restaurant_id) DO UPDATE SET rank = EXCLUDED.rank`,
          [collectionId, restaurantIds[index]!, index]
        );
      }
    }

    // 9. Upcoming ticketed dining events (Zomato Live-style)
    await client.query(
      `INSERT INTO dining_events
         (id, restaurant_id, title, description, image_url, category, starts_at, ends_at, price_paise, capacity, booked_count, is_active)
       VALUES
         ($1, $4, 'Chef''s Table: 24-hour Dal Makhani', 'A six-course tasting at the charcoal tandoor with the chef, including the signature dal finished tableside.',
          $7, 'DINING', NOW() + interval '3 days 19 hours', NOW() + interval '3 days 22 hours', 149900, 12, 3, true),
         ($2, $5, 'Biryani Masterclass & Lunch', 'Hands-on dum biryani workshop with spice blending, followed by a shared lunch.',
          $8, 'WORKSHOP', NOW() + interval '5 days 11 hours', NOW() + interval '5 days 14 hours', 89900, 16, 5, true),
         ($3, $6, 'Comedy Night on the Terrace', 'Stand-up sets under the stars with a burger-and-shake combo included.',
          $9, 'COMEDY', NOW() + interval '7 days 20 hours', NOW() + interval '7 days 23 hours', 49900, 30, 11, true)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description, image_url = EXCLUDED.image_url,
         category = EXCLUDED.category, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
         price_paise = EXCLUDED.price_paise, capacity = EXCLUDED.capacity, is_active = true`,
      [
        fixedId("d", 1),
        fixedId("d", 2),
        fixedId("d", 3),
        SEED_IDS.restaurant1Id,
        SEED_IDS.restaurant2Id,
        SEED_IDS.restaurant3Id,
        img("photo-1414235077428-338989a2e8c0", 900),
        img("photo-1556910103-1c02745aae4d", 900),
        img("photo-1514320291840-2e0a9bf2a9ae", 900),
      ]
    );

    await client.query("COMMIT");
    console.log("Database seeded successfully with deterministic fixtures!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seeding failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeeds()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
