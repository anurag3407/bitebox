# 27 - Database Migrations & Comprehensive Seed Data

## 1. Why Realistic Seed Data is Critical for Building

When developing a food delivery web platform, you cannot test spatial restaurant discovery, fuzzy dish search, or dispatch algorithms using dummy placeholders like *"Restaurant 1"* or *"Item A"*. 

You need:
* **Real Coordinates & H3 Cells:** True GPS points situated in dense dining hubs (e.g., Connaught Place in Delhi, Koramangala in Bengaluru) so distance formulas and H3 $k$-ring lookups return actual nearby matches.
* **Realistic Menus & Pricing:** Real dish titles (*"Hyderabadi Chicken Dum Biryani"*, *"Paneer Butter Masala"*, *"Butter Naan"*) with realistic Indian rupee pricing and food imagery.
* **Test Accounts:** Pre-seeded customer, merchant, and rider accounts with known credentials for instant testing.

---

## 2. Complete SQL Migration Script (`migrations/001_init_schema.sql`)

Run this SQL script against your local PostgreSQL database (port 5432):

```sql
-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Clean existing types if re-running
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS trip_status CASCADE;

CREATE TYPE user_role AS ENUM ('CUSTOMER', 'MERCHANT', 'RIDER', 'ADMIN');
CREATE TYPE order_status AS ENUM (
    'CREATED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED',
    'MERCHANT_NOTIFIED', 'MERCHANT_ACCEPTED', 'MERCHANT_REJECTED',
    'KITCHEN_PREPARING', 'FOOD_READY', 'RIDER_ASSIGNED',
    'RIDER_AT_RESTAURANT', 'ORDER_PICKED_UP', 'OUT_FOR_DELIVERY',
    'RIDER_AT_DOORSTEP', 'DELIVERED', 'CANCELLED'
);
CREATE TYPE payment_status AS ENUM ('INITIATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');
CREATE TYPE trip_status AS ENUM ('ASSIGNED', 'ARRIVED_AT_STORE', 'PICKED_UP', 'ARRIVED_AT_CUSTOMER', 'COMPLETED', 'FAILED');

-- 1. USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(128) NOT NULL,
    role user_role DEFAULT 'CUSTOMER',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. ADDRESSES
CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_label VARCHAR(32) DEFAULT 'Home',
    formatted_address TEXT NOT NULL,
    house_or_flat_number VARCHAR(64),
    landmark VARCHAR(128),
    coordinates GEOMETRY(Point, 4326) NOT NULL,
    h3_res8 VARCHAR(15) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_geo ON addresses USING GIST(coordinates);
CREATE INDEX idx_addresses_h3 ON addresses(h3_res8);

-- 3. RESTAURANTS
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    fssai_license_number VARCHAR(32) NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    email VARCHAR(255),
    coordinates GEOMETRY(Point, 4326) NOT NULL,
    h3_res8 VARCHAR(15) NOT NULL,
    address_text TEXT NOT NULL,
    rating_avg NUMERIC(3, 2) DEFAULT 4.20,
    rating_count INT DEFAULT 120,
    cost_for_two INT NOT NULL DEFAULT 400,
    is_pure_veg BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_accepting_orders BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    opens_at TIME NOT NULL DEFAULT '09:00:00',
    closes_at TIME NOT NULL DEFAULT '23:30:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_restaurants_h3 ON restaurants(h3_res8);
CREATE INDEX idx_restaurants_geo ON restaurants USING GIST(coordinates);

-- 4. MENU CATEGORIES & ITEMS
CREATE TABLE menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_veg BOOLEAN DEFAULT TRUE,
    price INT NOT NULL, -- Rupee units
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    prep_time_minutes INT DEFAULT 15,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id);

-- 5. RIDERS
CREATE TABLE riders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type VARCHAR(32) DEFAULT 'MOTORCYCLE',
    vehicle_plate_number VARCHAR(32),
    current_coordinates GEOMETRY(Point, 4326),
    current_h3_res9 VARCHAR(15),
    is_online BOOLEAN DEFAULT TRUE,
    is_busy BOOLEAN DEFAULT FALSE,
    rating NUMERIC(3, 2) DEFAULT 4.85,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_riders_geo ON riders USING GIST(current_coordinates);
CREATE INDEX idx_riders_h3 ON riders(current_h3_res9);

-- 6. ORDERS & ORDER ITEMS
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_user_id UUID NOT NULL REFERENCES users(id),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id),
    delivery_address_id UUID NOT NULL REFERENCES addresses(id),
    status order_status DEFAULT 'CREATED',
    subtotal_amount INT NOT NULL,
    delivery_charge INT NOT NULL DEFAULT 0,
    surge_charge INT NOT NULL DEFAULT 0,
    tax_amount INT NOT NULL DEFAULT 0,
    discount_amount INT NOT NULL DEFAULT 0,
    total_amount INT NOT NULL,
    delivery_otp VARCHAR(6),
    pickup_otp VARCHAR(6),
    customer_notes TEXT,
    row_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_orders_customer ON orders(customer_user_id);
CREATE INDEX idx_orders_restaurant ON orders(restaurant_id);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price INT NOT NULL,
    total_price INT NOT NULL
);

-- 7. OUTBOX EVENTS TABLE (Transactional Outbox)
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_outbox_unprocessed ON outbox_events(created_at) WHERE processed = FALSE;
```

---

## 3. Automated Realistic TypeScript Seeding Script (`scripts/seed.ts`)

Install dependencies first:
```bash
npm install pg h3-js dotenv
npm install -D @types/pg ts-node typescript
```

Now create and run `scripts/seed.ts`:

```typescript
import { Client } from "pg";
import { latLngToCell } from "h3-js";
import * as dotenv from "dotenv";

dotenv.config();

const client = new Client({
  connectionString: process.env.DIRECT_DATABASE_URL || "postgresql://postgres_admin:local_dev_secret_password_2026@localhost:5432/food_delivery_db?sslmode=disable",
});

async function runSeed() {
  await client.connect();
  console.log("Connected to PostgreSQL for database seeding...");

  try {
    // 1. Seed Test Users
    console.log("Seeding test users...");
    const customerRes = await client.query(`
      INSERT INTO users (phone_number, email, full_name, role)
      VALUES 
        ('+919876543210', 'customer.demo@platform.com', 'Aarav Sharma', 'CUSTOMER'),
        ('+919811122233', 'merchant.demo@platform.com', 'Chef Vikram Singh', 'MERCHANT'),
        ('+919899887766', 'rider.demo@platform.com', 'Rahul Verma', 'RIDER')
      ON CONFLICT (phone_number) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id, role;
    `);

    const customerId = customerRes.rows.find((r) => r.role === "CUSTOMER").id;
    const merchantId = customerRes.rows.find((r) => r.role === "MERCHANT").id;
    const riderUserId = customerRes.rows.find((r) => r.role === "RIDER").id;

    // 2. Seed Customer Address in Connaught Place, New Delhi
    const userLat = 28.6315;
    const userLng = 77.2167;
    const userH3 = latLngToCell(userLat, userLng, 8);

    await client.query(`
      INSERT INTO addresses (user_id, address_label, formatted_address, house_or_flat_number, landmark, coordinates, h3_res8, is_default)
      VALUES (
        $1, 'Home', 'Flat 402, Block B, Regal Building, Connaught Place, New Delhi',
        '402-B', 'Near Madame Tussauds',
        ST_SetSRID(ST_MakePoint($2, $3), 4326),
        $4, true
      ) ON CONFLICT DO NOTHING;
    `, [customerId, userLng, userLat, userH3]);

    // 3. Seed Realistic Restaurants around Delhi-NCR
    console.log("Seeding authentic restaurants...");
    const restaurantData = [
      {
        name: "Biryani Blues",
        slug: "biryani-blues-connaught-place",
        cuisines: "Biryani, Hyderabadi, Mughlai",
        lat: 28.6328,
        lng: 77.2195,
        rating: 4.5,
        cost_for_two: 500,
        image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80",
        categories: [
          {
            name: "Authentic Dum Biryani",
            items: [
              { name: "Hyderabadi Chicken Dum Biryani", price: 349, is_veg: false, desc: "Aromatic basmati rice cooked on slow dum with tender spiced chicken.", prep: 18 },
              { name: "Royal Mutton Biryani", price: 479, is_veg: false, desc: "Succulent mutton pieces layered with saffron infused rice.", prep: 20 },
              { name: "Paneer Subz Dum Biryani", price: 299, is_veg: true, desc: "Fresh cottage cheese cubes layered with garden vegetables and mint.", prep: 15 }
            ]
          },
          {
            name: "Starters & Kebabs",
            items: [
              { name: "Chicken Galouti Kebab (4 Pcs)", price: 289, is_veg: false, desc: "Melt-in-mouth minced chicken kebabs served with mint chutney.", prep: 12 },
              { name: "Dahi Ke Kebab", price: 229, is_veg: true, desc: "Crispy hung curd patties flavored with cardamom and coriander.", prep: 10 }
            ]
          }
        ]
      },
      {
        name: "Punjab Grill Express",
        slug: "punjab-grill-express-delhi",
        cuisines: "North Indian, Tandoori",
        lat: 28.6302,
        lng: 77.2150,
        rating: 4.6,
        cost_for_two: 650,
        image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80",
        categories: [
          {
            name: "Main Course Gravies",
            items: [
              { name: "Butter Chicken Boneless", price: 399, is_veg: false, desc: "Classic shredded chicken in rich satin tomato and butter gravy.", prep: 15 },
              { name: "Dal Makhani Overnight Slow Cooked", price: 289, is_veg: true, desc: "Black lentils simmered for 24 hours with fresh cream and butter.", prep: 10 },
              { name: "Paneer Tikka Butter Masala", price: 329, is_veg: true, desc: "Clay oven roasted paneer in spicy onion-tomato gravy.", prep: 14 }
            ]
          },
          {
            name: "Tandoori Breads",
            items: [
              { name: "Butter Naan", price: 55, is_veg: true, desc: "Soft leavened refined flour flatbread brushed with butter.", prep: 5 },
              { name: "Garlic Naan", price: 65, is_veg: true, desc: "Clay oven naan topped with minced roasted garlic.", prep: 5 }
            ]
          }
        ]
      }
    ];

    for (const rest of restaurantData) {
      const restH3 = latLngToCell(rest.lat, rest.lng, 8);
      const restInsert = await client.query(`
        INSERT INTO restaurants (
          owner_user_id, name, slug, fssai_license_number, phone_number,
          coordinates, h3_res8, address_text, rating_avg, cost_for_two, image_url
        ) VALUES (
          $1, $2, $3, '10019011000452', '+911145678900',
          ST_SetSRID(ST_MakePoint($4, $5), 4326), $6,
          'Outer Circle, Connaught Place, New Delhi', $7, $8, $9
        )
        ON CONFLICT (slug) DO UPDATE SET rating_avg = EXCLUDED.rating_avg
        RETURNING id;
      `, [merchantId, rest.name, rest.slug, rest.lng, rest.lat, restH3, rest.rating, rest.cost_for_two, rest.image]);

      const restaurantId = restInsert.rows[0].id;

      for (let cIdx = 0; cIdx < rest.categories.length; cIdx++) {
        const cat = rest.categories[cIdx];
        const catInsert = await client.query(`
          INSERT INTO menu_categories (restaurant_id, name, display_order)
          VALUES ($1, $2, $3) RETURNING id;
        `, [restaurantId, cat.name, cIdx]);

        const catId = catInsert.rows[0].id;

        for (const item of cat.items) {
          await client.query(`
            INSERT INTO menu_items (restaurant_id, category_id, name, description, is_veg, price, prep_time_minutes)
            VALUES ($1, $2, $3, $4, $5, $6, $7);
          `, [restaurantId, catId, item.name, item.desc, item.is_veg, item.price, item.prep]);
        }
      }
    }

    // 4. Seed Active Rider in Connaught Place
    const riderLat = 28.6320;
    const riderLng = 77.2175;
    const riderH3_9 = latLngToCell(riderLat, riderLng, 9);

    await client.query(`
      INSERT INTO riders (user_id, vehicle_type, vehicle_plate_number, current_coordinates, current_h3_res9, is_online, is_busy)
      VALUES (
        $1, 'MOTORCYCLE', 'DL-01-AB-1234',
        ST_SetSRID(ST_MakePoint($2, $3), 4326),
        $4, true, false
      );
    `, [riderUserId, riderLng, riderLat, riderH3_9]);

    console.log("Database successfully seeded with realistic restaurants, menus, user, and rider data!");
  } catch (err) {
    console.error("Error seeding database:", err);
  } finally {
    await client.end();
  }
}

runSeed();
```
