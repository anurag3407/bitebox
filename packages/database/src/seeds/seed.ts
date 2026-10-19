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

export async function runSeeds() {
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
      { latitude: 28.55, longitude: 77.30 },
      { latitude: 28.72, longitude: 77.30 },
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
      [
        SEED_IDS.customerUserId,
        SEED_IDS.merchantUserId,
        SEED_IDS.riderUserId,
        SEED_IDS.adminUserId,
      ]
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

    // 5. Restaurants
    // Restaurant 1: Punjabi Angithi
    await client.query(
      `INSERT INTO restaurants (
        id, merchant_id, city_id, service_zone_id, name, slug, cuisines, rating, rating_count,
        avg_price_for_one_paise, delivery_time_min_minutes, delivery_time_max_minutes,
        latitude, longitude, address_text, phone, is_accepting_orders, is_open, pure_veg, hero_image_url, offer_tag
      ) VALUES (
        $1, $2, $3, $4, 'Punjabi Angithi', 'punjabi-angithi',
        ARRAY['North Indian', 'Tandoor', 'Biryani'], 4.5, 342, 25000, 25, 35,
        28.6328, 77.2197, 'Outer Circle, Connaught Place, New Delhi', '+911145678901', true, true, false,
        'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80',
        '20% OFF UPTO ₹50'
      ) ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.restaurant1Id, SEED_IDS.merchantId, SEED_IDS.cityId, SEED_IDS.zoneId]
    );

    // Link merchant staff membership
    await client.query(
      `INSERT INTO merchant_memberships (id, user_id, restaurant_id, staff_role)
       VALUES (gen_random_uuid(), $1, $2, 'OWNER')
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.merchantUserId, SEED_IDS.restaurant1Id]
    );

    // Restaurant 2: Bikanervala (Pure Veg)
    await client.query(
      `INSERT INTO restaurants (
        id, merchant_id, city_id, service_zone_id, name, slug, cuisines, rating, rating_count,
        avg_price_for_one_paise, delivery_time_min_minutes, delivery_time_max_minutes,
        latitude, longitude, address_text, phone, is_accepting_orders, is_open, pure_veg, hero_image_url, offer_tag
      ) VALUES (
        $1, $2, $3, $4, 'Bikanervala Sweets & Chaat', 'bikanervala-sweets',
        ARRAY['Mithai', 'Street Food', 'North Indian', 'Chaat'], 4.4, 610, 20000, 20, 30,
        28.6298, 77.2155, 'Radha Cinema Complex, CP, New Delhi', '+911145678902', true, true, true,
        'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80',
        'FLAT ₹30 OFF'
      ) ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.restaurant2Id, SEED_IDS.merchantId, SEED_IDS.cityId, SEED_IDS.zoneId]
    );

    // Restaurant 3: The Burger Club
    await client.query(
      `INSERT INTO restaurants (
        id, merchant_id, city_id, service_zone_id, name, slug, cuisines, rating, rating_count,
        avg_price_for_one_paise, delivery_time_min_minutes, delivery_time_max_minutes,
        latitude, longitude, address_text, phone, is_accepting_orders, is_open, pure_veg, hero_image_url, offer_tag
      ) VALUES (
        $1, $2, $3, $4, 'The Burger Club', 'the-burger-club',
        ARRAY['Burgers', 'Fast Food', 'Beverages'], 4.3, 480, 18000, 15, 25,
        28.6340, 77.2210, 'Block B, Connaught Place, New Delhi', '+911145678903', true, true, false,
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
        'FREE FRIES ON ₹299'
      ) ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.restaurant3Id, SEED_IDS.merchantId, SEED_IDS.cityId, SEED_IDS.zoneId]
    );

    // 6. Menu Categories & Items for Restaurant 1 (Punjabi Angithi)
    const cat1Id = "80000000-0000-4000-8000-000000000001";
    const cat2Id = "80000000-0000-4000-8000-000000000002";
    const cat3Id = "80000000-0000-4000-8000-000000000003";

    await client.query(
      `INSERT INTO menu_categories (id, restaurant_id, name, display_order)
       VALUES
         ($1, $4, 'Tandoori Starters & Kebabs', 1),
         ($2, $4, 'Main Course Gravies', 2),
         ($3, $4, 'Fresh Tandoori Breads & Biryani', 3)
       ON CONFLICT (id) DO NOTHING`,
      [cat1Id, cat2Id, cat3Id, SEED_IDS.restaurant1Id]
    );

    // Items for Category 1
    const item1Id = "90000000-0000-4000-8000-000000000001";
    const item2Id = "90000000-0000-4000-8000-000000000002";
    const item3Id = "90000000-0000-4000-8000-000000000003";

    await client.query(
      `INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price_paise, dietary_tag, is_available, image_url)
       VALUES
         ($1, $4, $5, 'Paneer Tikka Shashlik', 'Fresh cottage cheese marinated in hung curd, Kashmiri spices, and char-grilled with capsicum and onions.', 28000, 'VEG', true, 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80'),
         ($2, $4, $5, 'Murgh Malai Tikka', 'Tender boneless chicken morsels infused with creamy cheese, cardamom, and gentle spices.', 34000, 'NON_VEG', true, 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80'),
         ($3, $4, $5, 'Tandoori Soya Chaap', 'Soya chaap skewers slow-cooked in charcoal clay oven with tandoori spices.', 25000, 'VEG', true, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80')
       ON CONFLICT (id) DO NOTHING`,
      [item1Id, item2Id, item3Id, SEED_IDS.restaurant1Id, cat1Id]
    );

    // Modifier groups for Murgh Malai Tikka
    const group1Id = "a0000000-0000-4000-8000-000000000001";
    await client.query(
      `INSERT INTO modifier_groups (id, menu_item_id, name, min_select, max_select, is_required)
       VALUES ($1, $2, 'Choice of Dip', 1, 1, true)
       ON CONFLICT (id) DO NOTHING`,
      [group1Id, item2Id]
    );

    await client.query(
      `INSERT INTO modifier_options (id, group_id, name, price_paise, is_available)
       VALUES
         (gen_random_uuid(), $1, 'Mint Chutney (Default)', 0, true),
         (gen_random_uuid(), $1, 'Garlic Mayo Dip', 3000, true),
         (gen_random_uuid(), $1, 'Extra Spicy Peri-Peri Dip', 4000, true)
       ON CONFLICT (id) DO NOTHING`,
      [group1Id]
    );

    // Items for Category 2 (Main Course)
    const item4Id = "90000000-0000-4000-8000-000000000004";
    const item5Id = "90000000-0000-4000-8000-000000000005";

    await client.query(
      `INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price_paise, dietary_tag, is_available, image_url)
       VALUES
         ($1, $4, $3, 'Dal Makhani (Signature)', 'Slow cooked for 24 hours on slow charcoal, finished with white butter and fresh cream.', 29000, 'VEG', true, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80'),
         ($2, $4, $3, 'Butter Chicken Delhi Style', 'Tandoori shredded chicken simmered in a velvety aromatic tomato and cashew gravy.', 39000, 'NON_VEG', true, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80')
       ON CONFLICT (id) DO NOTHING`,
      [item4Id, item5Id, cat2Id, SEED_IDS.restaurant1Id]
    );

    // Variants for Dal Makhani (Half / Full)
    await client.query(
      `INSERT INTO item_variants (id, menu_item_id, name, price_paise, is_available)
       VALUES
         (gen_random_uuid(), $1, 'Half Portion (500ml)', 29000, true),
         (gen_random_uuid(), $1, 'Full Portion (800ml)', 48000, true)
       ON CONFLICT (id) DO NOTHING`,
      [item4Id]
    );

    // 7. Rider Fixture
    await client.query(
      `INSERT INTO riders (id, user_id, name, phone, vehicle_type, is_approved, is_online, current_latitude, current_longitude, last_ping_at)
       VALUES ($1, $2, 'Amit Kumar', '+919876543212', 'MOTORCYCLE', true, true, 28.6320, 77.2180, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.riderId, SEED_IDS.riderUserId]
    );

    // 8. Coupons
    await client.query(
      `INSERT INTO coupons (id, code, type, discount_value, max_discount_paise, min_order_paise, is_active)
       VALUES
         (gen_random_uuid(), 'WELCOME50', 'PERCENTAGE', 50, 10000, 20000, true),
         (gen_random_uuid(), 'FLAT100', 'FLAT', 10000, 10000, 40000, true),
         (gen_random_uuid(), 'ZOMATOSTYLE', 'PERCENTAGE', 20, 5000, 15000, true)
       ON CONFLICT (code) DO NOTHING`
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

if (process.argv[1] === import.meta.filename) {
  runSeeds()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
