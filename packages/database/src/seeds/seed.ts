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
            imageUrl: img("photo-1599488615731-7e5c2823ff28"),
            bestseller: true,
          },
          {
            id: 2,
            name: "Murgh Malai Tikka",
            description: "Tender boneless chicken morsels infused with creamy cheese, cardamom, and gentle spices.",
            pricePaise: 34000,
            dietaryTag: "NON_VEG",
            imageUrl: img("photo-1626777552726-4a6b54c97e46"),
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
       opening_hours, avg_prep_minutes, max_delivery_radius_meters
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 25, 35, $11, $12, $13, $14, true, true, $15, $16, $17, $18, $19, 7000)
     ON CONFLICT (id) DO UPDATE SET opening_hours = EXCLUDED.opening_hours, avg_prep_minutes = EXCLUDED.avg_prep_minutes`,
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
                                 is_available, image_url, is_bestseller, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET is_bestseller = EXCLUDED.is_bestseller, display_order = EXCLUDED.display_order`,
        [itemId, r.id, categoryId, item.name, item.description, item.pricePaise, item.dietaryTag, item.imageUrl, item.bestseller ?? false, itemIndex]
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

    // 6. Rider Fixture
    await client.query(
      `INSERT INTO riders (id, user_id, name, phone, vehicle_type, is_approved, is_online, current_latitude, current_longitude, last_ping_at)
       VALUES ($1, $2, 'Amit Kumar', '+919876543212', 'MOTORCYCLE', true, true, 28.6320, 77.2180, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.riderId, SEED_IDS.riderUserId]
    );

    // 7. Coupons with realistic limits
    await client.query(
      `INSERT INTO coupons (id, code, type, discount_value, max_discount_paise, min_order_paise, is_active,
                            description, usage_limit_per_user, first_order_only)
       VALUES
         ($1, 'WELCOME50', 'PERCENTAGE', 50, 10000, 20000, true, '50% off up to ₹100 on your first order', 1, true),
         ($2, 'FLAT100', 'FLAT', 10000, 10000, 40000, true, 'Flat ₹100 off on orders above ₹400', 3, false),
         ($3, 'ZOMATOSTYLE', 'PERCENTAGE', 20, 5000, 15000, true, '20% off up to ₹50', NULL, false),
         ($4, 'FREEDEL', 'FREE_DELIVERY', 0, NULL, 19900, true, 'Free delivery on orders above ₹199', 5, false)
       ON CONFLICT (code) DO NOTHING`,
      [fixedId("d", 1), fixedId("d", 2), fixedId("d", 3), fixedId("d", 4)]
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
