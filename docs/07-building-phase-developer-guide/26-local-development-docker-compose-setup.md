# 26 - Local Development Docker Compose Setup

## 1. Why This Is Used (Human-Readable Context)

When building an enterprise-grade food delivery platform modeled after Swiggy and Zomato, you cannot simply run a standalone SQLite database. The platform relies on five specialized infrastructure engines:
1. **PostgreSQL with PostGIS:** For strict ACID order processing and spatial geographical queries.
2. **PgBouncer:** For high-throughput connection pooling so hundreds of app workers don't exhaust PostgreSQL connections.
3. **Redis 7:** For sub-millisecond caching, active carts, and geospatial rider indices.
4. **Apache Kafka (KRaft Mode):** For high-speed asynchronous event streaming (e.g., broadcasting `OrderPlaced`, `RiderAssigned`) without needing legacy Zookeeper.
5. **OpenSearch:** For typo-tolerant, phonetic Indian cuisine searching.

Instead of spending days manually installing and configuring these five services locally, **Docker Compose** spins up the entire production-mirroring stack in **under 60 seconds with a single command**.

---

## 2. Complete Production-Mirroring `docker-compose.yml`

Create this file in the root directory of your project:

```yaml
version: '3.8'

services:
  # ---------------------------------------------------------------------------
  # 1. PostgreSQL 15 + PostGIS (Spatial Database)
  # ---------------------------------------------------------------------------
  postgres:
    image: postgis/postgis:15-3.4-alpine
    container_name: food_delivery_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: food_delivery_db
      POSTGRES_USER: postgres_admin
      POSTGRES_PASSWORD: local_dev_secret_password_2026
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres_admin -d food_delivery_db"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - internal_food_net

  # ---------------------------------------------------------------------------
  # 2. PgBouncer (Connection Pooling Layer)
  # ---------------------------------------------------------------------------
  pgbouncer:
    image: edoburu/pgbouncer:v1.21.0
    container_name: food_delivery_pgbouncer
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DB_USER: postgres_admin
      DB_PASSWORD: local_dev_secret_password_2026
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: food_delivery_db
      POOL_MODE: transaction # Critical: Transaction pooling prevents connection starvation
      MAX_CLIENT_CONN: 5000
      DEFAULT_POOL_SIZE: 30
      ADMIN_USERS: postgres_admin
    ports:
      - "6432:6432" # App connects to port 6432 instead of 5432
    networks:
      - internal_food_net

  # ---------------------------------------------------------------------------
  # 3. Redis 7 (In-Memory Cache & Geospatial Stream)
  # ---------------------------------------------------------------------------
  redis:
    image: redis:7.2-alpine
    container_name: food_delivery_redis
    restart: unless-stopped
    command: redis-server --requirepass redis_dev_password_2026 --maxmemory 512mb --maxmemory-policy volatile-lru
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "redis_dev_password_2026", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - internal_food_net

  # ---------------------------------------------------------------------------
  # 4. Apache Kafka (KRaft Mode - Zero Zookeeper)
  # ---------------------------------------------------------------------------
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    container_name: food_delivery_kafka
    restart: unless-stopped
    ports:
      - "9092:9092"
      - "29092:29092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT'
      KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092'
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_PROCESS_ROLES: 'broker,controller'
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:29093'
      KAFKA_LISTENERS: 'PLAINTEXT://0.0.0.0:29092,CONTROLLER://0.0.0.0:29093,PLAINTEXT_HOST://0.0.0.0:9092'
      KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER'
      KAFKA_LOG_DIRS: '/tmp/kraft-combined-logs'
      CLUSTER_ID: 'MkU3OEVBNTcwNTJENDM2Qk'
    volumes:
      - kafka_data:/var/lib/kafka/data
    networks:
      - internal_food_net

  # ---------------------------------------------------------------------------
  # 5. Kafka UI (Visual Dashboard for Topics & Messages)
  # ---------------------------------------------------------------------------
  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    container_name: food_delivery_kafka_ui
    restart: unless-stopped
    depends_on:
      - kafka
    ports:
      - "8080:8080" # Visit http://localhost:8080 to inspect events
    environment:
      KAFKA_CLUSTERS_0_NAME: local-cluster
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:29092
    networks:
      - internal_food_net

  # ---------------------------------------------------------------------------
  # 6. OpenSearch (Fuzzy Dish & Restaurant Search Engine)
  # ---------------------------------------------------------------------------
  opensearch:
    image: opensearchproject/opensearch:2.12.0
    container_name: food_delivery_opensearch
    restart: unless-stopped
    environment:
      - discovery.type=single-node
      - plugins.security.disabled=true # Disabled for easy local development
      - "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
      - "9600:9600"
    volumes:
      - opensearch_data:/usr/share/opensearch/data
    networks:
      - internal_food_net

volumes:
  postgres_data:
  redis_data:
  kafka_data:
  opensearch_data:

networks:
  internal_food_net:
    driver: bridge
```

---

## 3. Step-by-Step Launch Instructions

### Step 1: Start All Services in Background
```bash
docker compose up -d
```

### Step 2: Verify All Containers Are Healthy
```bash
docker compose ps
```
You should see all 6 services with status `Up` or `Up (healthy)`.

### Step 3: Access Developer Dashboards
* **Kafka UI:** Open [http://localhost:8080](http://localhost:8080) in your browser. You can view all live topics (`orders.lifecycle.v1`, `rider.telemetry.v1`) and inspect event payloads.
* **OpenSearch Health Check:**
  ```bash
  curl http://localhost:9200
  ```
* **PostgreSQL Connection Test:**
  ```bash
  psql "postgresql://postgres_admin:local_dev_secret_password_2026@localhost:5432/food_delivery_db" -c "SELECT postgis_full_version();"
  ```

---

## 4. Local Environment Configuration (`.env.local`)

Copy these variables into your backend application's `.env` file:

```env
# Application Port & Node Environment
PORT=4000
NODE_ENV=development

# Database Connection via PgBouncer (Port 6432)
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL="postgresql://postgres_admin:local_dev_secret_password_2026@localhost:6432/food_delivery_db?sslmode=disable"

# Direct Database Connection for Prisma/Migrations (Port 5432)
DIRECT_DATABASE_URL="postgresql://postgres_admin:local_dev_secret_password_2026@localhost:5432/food_delivery_db?sslmode=disable"

# Redis Cache Connection
REDIS_URL="redis://:redis_dev_password_2026@localhost:6379"

# Apache Kafka Broker
KAFKA_BROKERS="localhost:9092"
KAFKA_CLIENT_ID="food-delivery-dev-client"

# OpenSearch Cluster
OPENSEARCH_NODE="http://localhost:9200"

# JWT Authentication Secrets
JWT_ACCESS_SECRET="local_dev_jwt_access_super_secret_32chars_long"
JWT_REFRESH_SECRET="local_dev_jwt_refresh_super_secret_32chars_long"

# Razorpay Sandbox Credentials (Get from dashboard.razorpay.com)
RAZORPAY_KEY_ID="rzp_test_placeholder"
RAZORPAY_KEY_SECRET="rzp_secret_placeholder"
RAZORPAY_WEBHOOK_SECRET="local_webhook_secret_key"
```

---

## 5. Developer Gotchas & Troubleshooting

1. **Docker Desktop Memory on macOS:**
   * OpenSearch + Kafka + Postgres + Redis require at least **4 GB to 6 GB of RAM** allocated in Docker Desktop settings. If containers exit with code 137, increase RAM in Docker Desktop $\to$ Settings $\to$ Resources.
2. **PgBouncer vs Direct Port for Schema Migrations:**
   * **Crucial Rule:** When running schema migrations (e.g. `prisma migrate` or `npm run migrate`), **always use port 5432** (`DIRECT_DATABASE_URL`). PgBouncer in `transaction` mode does not support advisory locks and prepared statements required by migration runners.
   * Runtime application queries should **always use port 6432** (`DATABASE_URL`) to leverage connection pooling.
