# 16 - API Contracts: REST & gRPC Specifications

## 1. RESTful API Specifications (Client to Gateway)

All external client-facing web endpoints adhere to JSON:API standards and return a uniform envelope structure:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "timestamp": "2026-10-19T03:00:00Z"
}
```

---

### Endpoint 1: Restaurant Discovery Feed
* **Method & Path:** `GET /api/v1/restaurants/feed`
* **Query Parameters:**
  * `lat` (float, required): User latitude, e.g., `28.6139`
  * `lng` (float, required): User longitude, e.g., `77.2090`
  * `cursor` (string, optional): Pagination offset
  * `filter_veg` (boolean, optional): Filter purely vegetarian
* **Sample 200 OK Response:**
```json
{
  "success": true,
  "data": {
    "h3_cluster": "88618925d3fffff",
    "restaurants": [
      {
        "id": "7b89d42e-128a-4d2b-9238-66a987d6e421",
        "name": "Punjab Grill Kitchen",
        "slug": "punjab-grill-connaught-place",
        "rating": 4.6,
        "prep_and_delivery_eta_mins": 32,
        "cost_for_two": 450,
        "cuisines": ["North Indian", "Mughlai"],
        "is_pure_veg": false,
        "thumbnail_url": "https://cdn.platform.com/restaurants/thumb_pg.webp",
        "discount_badge": "50% OFF up to ₹100"
      }
    ],
    "next_cursor": "eyJvZmZzZXQiOjIwfQ=="
  }
}
```

---

### Endpoint 2: Order Checkout Initiation (Idempotent)
* **Method & Path:** `POST /api/v1/orders/checkout`
* **Headers:**
  * `Authorization: Bearer <JWT_TOKEN>`
  * `Idempotency-Key: <UUID_V4>` (Required to eliminate duplicate billing)
* **Request Body:**
```json
{
  "restaurant_id": "7b89d42e-128a-4d2b-9238-66a987d6e421",
  "delivery_address_id": "1c93a890-562a-43cf-bf29-37f26d2e0911",
  "cart_items": [
    {
      "menu_item_id": "902d3381-648b-4c22-8349-8c90b6a2f441",
      "quantity": 2
    }
  ],
  "coupon_code": "WELCOME50",
  "payment_method": "UPI"
}
```
* **Sample 201 Created Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "d3b07384-d113-4a44-a035-7c08b292e74e",
    "status": "PAYMENT_PENDING",
    "pricing": {
      "subtotal": 500,
      "delivery_fee": 30,
      "surge_fee": 15,
      "discount": 50,
      "tax": 25,
      "total_amount_payable": 520
    },
    "payment_gateway": {
      "gateway": "RAZORPAY",
      "gateway_order_id": "order_EKfMRdaPv7DfSc",
      "key_id": "rzp_live_xK9110a",
      "currency": "INR"
    }
  }
}
```

---

## 2. Internal Microservice gRPC Protocols (.proto)

High-frequency, inter-service communications (telemetry streaming and internal state commands) utilize binary **Protobuf over HTTP/2**:

```protobuf
syntax = "proto3";

package delivery.v1;

option go_package = "github.com/platform/gen/delivery/v1;deliveryv1";

// 1. Telemetry Ingestion Service
service TelemetryService {
  rpc StreamRiderCoordinates(stream RiderLocationPing) returns (PingAcknowledgment);
  rpc GetRiderLocation(RiderLocationRequest) returns (RiderLocationResponse);
}

message RiderLocationPing {
  string rider_id = 1;
  double latitude = 2;
  double longitude = 3;
  float speed_kmh = 4;
  float heading_degrees = 5;
  int64 timestamp_epoch_ms = 6;
  string current_h3_res9 = 7;
}

message PingAcknowledgment {
  bool accepted = 1;
  int32 next_ping_interval_seconds = 2; // Dynamic rate control
}

message RiderLocationRequest {
  string rider_id = 1;
}

message RiderLocationResponse {
  string rider_id = 1;
  double latitude = 2;
  double longitude = 3;
  int64 last_seen_epoch_ms = 4;
}

// 2. Dispatch Assignment Service
service DispatchService {
  rpc AssignOrderToRider(DispatchAssignmentRequest) returns (DispatchAssignmentResponse);
  rpc UpdateTripMilestone(TripMilestoneRequest) returns (TripMilestoneResponse);
}

message DispatchAssignmentRequest {
  string order_id = 1;
  string restaurant_id = 2;
  double pickup_lat = 3;
  double pickup_lng = 4;
  double dropoff_lat = 5;
  double dropoff_lng = 6;
  int32 estimated_prep_seconds = 7;
}

message DispatchAssignmentResponse {
  bool success = 1;
  string assigned_rider_id = 2;
  int32 estimated_pickup_seconds = 3;
}

message TripMilestoneRequest {
  string trip_id = 1;
  string milestone = 2; // 'ARRIVED_AT_STORE', 'PICKED_UP', 'DELIVERED'
  string verification_otp = 3;
}

message TripMilestoneResponse {
  bool verified = 1;
  string next_expected_state = 2;
}
```
