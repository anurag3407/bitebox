# 32 - Uber H3 Geospatial Dispatch Service Implementation

## 1. Why Uber H3 Hexagonal Partitioning for Real-Time Dispatch?

In an active metropolitan city with 3,000 restaurants, 5,000 delivery partners, and 15,000 active orders, finding which rider should pick up which order in real time cannot be solved by brute-force database scans (`SELECT * FROM riders WHERE ST_DWithin(...)`).

**Uber H3 partitions the world into a discrete mathematical coordinate system:**
1. **Integer/String Array Hash Lookups:** A user coordinate is converted into a 64-bit hexadecimal string (e.g., `88618925d3fffff`). 
2. **Instant Neighbor Retrieval:** Calling `gridDisk(cell, 5)` returns the 61 contiguous hexagonal cells covering a 4.5 km delivery radius in **less than 0.1 milliseconds** without executing any trigonometric spatial queries.
3. **Local Fleet Partitioning:** Riders are indexed in Redis Sets partitioned by their current H3 cell. Finding all candidate riders within 1 km is as simple as running `SUNION` across 7 Redis sets.

```mermaid
flowchart TD
    OrderReady[Order Food Ready: Lat/Lng] --> CellConv[Convert to H3 Resolution 9: 89618925d3fffff]
    CellConv --> KRing[gridDisk k=2: 19 Neighboring H3 Hexagons]
    KRing --> RedisQuery["Redis SUNION: Fetch Active Riders in those 19 Cells"]
    RedisQuery --> CandidateRiders[Filtered Candidate Riders: e.g. 8 Riders]
    CandidateRiders --> CostMatrix[Hungarian Bipartite Cost Evaluation]
    CostMatrix --> OptimalRider[Assign Optimal Delivery Partner]
```

---

## 2. Complete Dispatch Service Implementation (`src/services/dispatch.service.ts`)

Install dependencies:
```bash
npm install h3-js ioredis pg
```

```typescript
import { latLngToCell, gridDisk } from "h3-js";
import { Redis } from "ioredis";
import { dbPool } from "../plugins/database.plugin";

export interface CandidateOrder {
  id: string;
  restaurantId: string;
  restLat: number;
  restLng: number;
  restH3_9: string;
  foodReadyTimeEpoch: number;
  promisedSlaEpoch: number;
}

export interface CandidateRider {
  id: string;
  currentLat: number;
  currentLng: number;
  currentH3_9: string;
}

export class DispatchEngineService {
  constructor(private redis: Redis) {}

  /**
   * Ingest high-frequency GPS ping from Rider App
   */
  public async ingestRiderPing(riderId: string, lat: number, lng: number) {
    const h3_9 = latLngToCell(lat, lng, 9); // Resolution 9 (~174m edge length)
    const pipeline = this.redis.pipeline();

    // 1. Add to Redis Geospatial Index
    pipeline.geoadd("fleet:geo:active", lng, lat, riderId);

    // 2. Add to H3 Cell Set with 60-second TTL
    pipeline.sadd(`h3:riders:res9:${h3_9}`, riderId);
    pipeline.expire(`h3:riders:res9:${h3_9}`, 60);

    // 3. Update Rider's last-known cell mapping
    pipeline.set(`rider:${riderId}:cell`, h3_9, "EX", 60);

    await pipeline.exec();
  }

  /**
   * Main Dispatch Cron Job (Executes every 20 seconds)
   */
  public async executeDispatchCycle() {
    const client = await dbPool.connect();

    try {
      // 1. Fetch all pending orders waiting for a delivery partner
      const pendingOrdersQuery = await client.query(`
        SELECT 
          o.id, o.restaurant_id,
          ST_Y(r.coordinates) AS rest_lat, ST_X(r.coordinates) AS rest_lng,
          EXTRACT(EPOCH FROM (o.created_at + INTERVAL '20 minutes')) AS promised_sla,
          EXTRACT(EPOCH FROM NOW()) AS current_epoch
        FROM orders o
        JOIN restaurants r ON o.restaurant_id = r.id
        WHERE o.status IN ('MERCHANT_ACCEPTED', 'KITCHEN_PREPARING', 'FOOD_READY')
          AND NOT EXISTS (
            SELECT 1 FROM delivery_trips dt WHERE dt.order_id = o.id AND dt.status != 'FAILED'
          )
        ORDER BY o.created_at ASC
        LIMIT 25;
      `);

      if (pendingOrdersQuery.rows.length === 0) return;

      for (const orderRow of pendingOrdersQuery.rows) {
        const restLat = parseFloat(orderRow.rest_lat);
        const restLng = parseFloat(orderRow.rest_lng);
        const restH3_9 = latLngToCell(restLat, restLng, 9);

        // 2. Expand k-rings to find candidate cells (k=3 covers approx. 1.2 km radius)
        const candidateHexagons = gridDisk(restH3_9, 3);
        const cellKeys = candidateHexagons.map((hex) => `h3:riders:res9:${hex}`);

        // 3. Find all online, unassigned riders in these hexagons
        const availableRiderIds: string[] = await this.redis.sunion(...cellKeys);
        if (availableRiderIds.length === 0) continue;

        // 4. Calculate cost matrix to pick the optimal delivery partner
        let bestRiderId: string | null = null;
        let lowestCost = Infinity;

        for (const riderId of availableRiderIds) {
          // Check if rider is already on an active trip
          const isBusy = await this.redis.get(`rider:${riderId}:busy`);
          if (isBusy) continue;

          // Fetch rider coordinates from Redis GEO
          const pos = await this.redis.geopos("fleet:geo:active", riderId);
          if (!pos || !pos[0]) continue;

          const riderLng = parseFloat(pos[0][0]);
          const riderLat = parseFloat(pos[0][1]);

          // Calculate Euclidean/Haversine distance (meters)
          const distMeters = this.haversineDistance(riderLat, riderLng, restLat, restLng);
          const travelTimeSec = distMeters / 6.0; // Approx 21 km/h driving speed

          // Cost Function: Travel Time + Idle Factor
          const assignmentCost = travelTimeSec;

          if (assignmentCost < lowestCost) {
            lowestCost = assignmentCost;
            bestRiderId = riderId;
          }
        }

        // 5. Assign Winning Rider
        if (bestRiderId) {
          await this.assignOrderToRider(client, orderRow.id, bestRiderId);
        }
      }
    } finally {
      client.release();
    }
  }

  private async assignOrderToRider(client: any, orderId: string, riderId: string) {
    await client.query("BEGIN");

    // Create delivery trip
    await client.query(
      `INSERT INTO delivery_trips (order_id, rider_id, status) VALUES ($1, $2, 'ASSIGNED')`,
      [orderId, riderId]
    );

    // Update Order Status
    await client.query(
      `UPDATE orders SET status = 'RIDER_ASSIGNED', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    await client.query("COMMIT");

    // Mark rider busy in Redis for 15 minutes
    await this.redis.set(`rider:${riderId}:busy`, "1", "EX", 900);

    // Broadcast assignment to rider's WebSocket/Push channel
    await this.redis.publish(`rider:${riderId}:assignment`, JSON.stringify({
      orderId,
      status: "ASSIGNED",
      timestamp: Date.now()
    }));

    console.log(`Successfully dispatched Order #${orderId} to Rider #${riderId}`);
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
```
