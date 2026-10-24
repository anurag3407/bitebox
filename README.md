# ZomatoFresh — Food Delivery PWA

## Quickstart (local)

```bash
pnpm install
createdb startup_dev && createdb startup_test          # PostgreSQL 15+
cp .env.example .env                                    # placeholders = dev mode (demo sign-in, simulated payments)
DATABASE_URL=postgresql://localhost:5432/startup_dev pnpm db:migrate && pnpm db:seed
pnpm dev:web          # http://localhost:3000  → Sign in → pick a persona
pnpm dev:worker       # timeouts, dispatch, refunds, notifications
pnpm test             # runs against startup_test (migrated + seeded automatically)
```

Production: fill real secrets in `.env` with `APP_ENV=production`, then `infra/scripts/deploy.sh`.
Review findings, architecture and remaining gaps: [docs/implementation/production-readiness.md](docs/implementation/production-readiness.md).
Business model, unit economics and revenue strategy: [docs/business/business-model-strategy.md](docs/business/business-model-strategy.md).

---

# Enterprise Food Delivery Platform: System Design & Architecture Handbook

> Production-Grade System Architecture, Low-Level Design (LLD), High-Level Design (HLD), Case Studies (Swiggy & Zomato), and Complete Web-First Developer Building Guide.

---

## 🗺️ Master Architecture Navigation Index

```
startup/
├── README.md (Master Architecture Handbook Index)
└── docs/
    ├── 00-overview/
    │   ├── 01-executive-summary.md
    │   └── 02-functional-and-non-functional-requirements.md
    ├── 01-swiggy-zomato-case-studies/
    │   ├── 03-swiggy-engineering-deep-dive.md
    │   ├── 04-zomato-engineering-deep-dive.md
    │   └── 05-real-world-outages-and-post-mortems.md
    ├── 02-system-architecture-hld/
    │   ├── 06-high-level-system-architecture.md
    │   ├── 07-geospatial-indexing-and-h3-hexagons.md
    │   ├── 08-order-lifecycle-distributed-state-machine.md
    │   ├── 09-distributed-transactions-saga-pattern.md
    │   └── 10-real-time-location-tracking-and-websockets.md
    ├── 03-core-engines-and-algorithms/
    │   ├── 11-delivery-dispatch-and-batching-engine.md
    │   ├── 12-recommendation-and-personalization-engine.md
    │   ├── 13-dynamic-pricing-surge-and-eta-engine.md
    │   └── 14-search-catalog-and-fuzzy-matching-engine.md
    ├── 04-low-level-design-data-models/
    │   ├── 15-complete-postgresql-database-schema.md
    │   ├── 16-api-contracts-rest-and-grpc.md
    │   └── 17-caching-tier-redis-and-in-memory-stores.md
    ├── 05-scalability-infrastructure/
    │   ├── 18-database-partitioning-sharding-replication.md
    │   ├── 19-kafka-event-driven-architecture.md
    │   ├── 20-observability-resilience-circuit-breakers.md
    │   └── 21-payment-gateway-integration-and-security.md
    ├── 06-web-platform-implementation/
    │   ├── 22-web-frontend-architecture-nextjs.md
    │   ├── 23-backend-tech-stack-decision-matrix.md
    │   ├── 24-future-hyperlocal-plug-in-architecture.md
    │   └── 25-mvp-to-hyper-scale-execution-roadmap.md
    └── 07-building-phase-developer-guide/
        ├── 26-local-development-docker-compose-setup.md
        ├── 27-database-migrations-and-seed-data.md
        ├── 28-backend-scaffolding-fastify-clean-architecture.md
        ├── 29-order-checkout-and-idempotency-implementation.md
        ├── 30-razorpay-payment-integration-and-webhook-handler.md
        ├── 31-realtime-tracking-sse-and-websockets-implementation.md
        ├── 32-uber-h3-geospatial-dispatch-service-implementation.md
        ├── 33-nextjs-frontend-scaffolding-and-cart-implementation.md
        └── 34-production-deployment-kubernetes-and-terraform.md
```

---

## 🧭 Reading Paths: Where Should You Start?

| Your Immediate Goal | Recommended Reading Sequence |
| :--- | :--- |
| **🚀 Hands-On Builder (Writing Code Today)** | Read [26 - Docker Compose](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/26-local-development-docker-compose-setup.md) $\to$ [27 - Migrations & Seeds](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/27-database-migrations-and-seed-data.md) $\to$ [28 - Fastify Backend](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/28-backend-scaffolding-fastify-clean-architecture.md) $\to$ [33 - Next.js Cart](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/33-nextjs-frontend-scaffolding-and-cart-implementation.md). |
| **🧠 System Architect (High-Level Design)** | Read [06 - High-Level Architecture](file:///Users/jarvis/startup/docs/02-system-architecture-hld/06-high-level-system-architecture.md) $\to$ [07 - Uber H3 Hexagons](file:///Users/jarvis/startup/docs/02-system-architecture-hld/07-geospatial-indexing-and-h3-hexagons.md) $\to$ [08 - Order State Machine](file:///Users/jarvis/startup/docs/02-system-architecture-hld/08-order-lifecycle-distributed-state-machine.md) $\to$ [09 - Saga Pattern](file:///Users/jarvis/startup/docs/02-system-architecture-hld/09-distributed-transactions-saga-pattern.md). |
| **📊 Product & Case Studies (Learning from Giants)** | Read [03 - Swiggy Deep Dive](file:///Users/jarvis/startup/docs/01-swiggy-zomato-case-studies/03-swiggy-engineering-deep-dive.md) $\to$ [04 - Zomato Deep Dive](file:///Users/jarvis/startup/docs/01-swiggy-zomato-case-studies/04-zomato-engineering-deep-dive.md) $\to$ [05 - Outages & Post-Mortems](file:///Users/jarvis/startup/docs/01-swiggy-zomato-case-studies/05-real-world-outages-and-post-mortems.md). |
| **⚡ Dispatch, Surge & Recommendations** | Read [11 - Dispatch Engine](file:///Users/jarvis/startup/docs/03-core-engines-and-algorithms/11-delivery-dispatch-and-batching-engine.md) $\to$ [12 - Recommendation Engine](file:///Users/jarvis/startup/docs/03-core-engines-and-algorithms/12-recommendation-and-personalization-engine.md) $\to$ [13 - Dynamic Surge](file:///Users/jarvis/startup/docs/03-core-engines-and-algorithms/13-dynamic-pricing-surge-and-eta-engine.md). |
| **🏫 Hyperlocal / Campus Plug-in Plan** | Read [24 - Future Hyperlocal Plug-in Architecture](file:///Users/jarvis/startup/docs/06-web-platform-implementation/24-future-hyperlocal-plug-in-architecture.md). |

---

## 📚 Complete Document Descriptions

### Module 00: Overview & Business Requirements
* [01 - Executive Summary](file:///Users/jarvis/startup/docs/00-overview/01-executive-summary.md): Product vision, web-first strategic advantages, five core architectural pillars, and phased rollout.
* [02 - Functional & Non-Functional Requirements](file:///Users/jarvis/startup/docs/00-overview/02-functional-and-non-functional-requirements.md): User personas, system FRs, latency SLAs, CAP theorem decisions, and mathematical peak capacity estimations.

### Module 01: Swiggy & Zomato Case Studies
* [03 - Swiggy Engineering Deep Dive](file:///Users/jarvis/startup/docs/01-swiggy-zomato-case-studies/03-swiggy-engineering-deep-dive.md): Monolith to microservices migration, the "Promise Engine" ETA math, DSP bipartite dispatching, and New Year's Eve 10,000+ orders/min handling.
* [04 - Zomato Engineering Deep Dive](file:///Users/jarvis/startup/docs/01-swiggy-zomato-case-studies/04-zomato-engineering-deep-dive.md): Elasticsearch Indian cuisine fuzzy search, live tracking with MQTT and road-snapping, and atomic Lua script coupon engines.
* [05 - Real-World Outages & Post-Mortems](file:///Users/jarvis/startup/docs/01-swiggy-zomato-case-studies/05-real-world-outages-and-post-mortems.md): Payment gateway timeout cascades (thread starvation), cache stampedes (dogpiling), and supply-demand rain death spirals.

### Module 02: High-Level System Architecture (HLD)
* [06 - High-Level System Architecture](file:///Users/jarvis/startup/docs/02-system-architecture-hld/06-high-level-system-architecture.md): C4 container diagram, microservices bounded contexts, synchronous vs asynchronous communication matrix, and edge security.
* [07 - Geospatial Indexing & Uber H3 Hexagons](file:///Users/jarvis/startup/docs/02-system-architecture-hld/07-geospatial-indexing-and-h3-hexagons.md): Why hexagons beat square geohashes, resolution tiers (Res 7 vs 8 vs 9), k-ring neighbor search, and production TypeScript implementation.
* [08 - Order Lifecycle Distributed State Machine](file:///Users/jarvis/startup/docs/02-system-architecture-hld/08-order-lifecycle-distributed-state-machine.md): Strict FSM state diagram, transition matrix, optimistic concurrency locks, auto-rejection timeouts, and exception handling.
* [09 - Distributed Transactions: Saga & Outbox Pattern](file:///Users/jarvis/startup/docs/02-system-architecture-hld/09-distributed-transactions-saga-pattern.md): Why 2PC fails, Orchestrated Saga flow, compensating rollback steps, PostgreSQL Transactional Outbox pattern, and idempotency keys.
* [10 - Real-Time Location Tracking & WebSockets](file:///Users/jarvis/startup/docs/02-system-architecture-hld/10-real-time-location-tracking-and-websockets.md): End-to-end GPS pipeline, SSE vs WebSocket trade-offs, adaptive rider battery optimization, client-side LERP animation, and Go WebSocket gateway.

### Module 03: Core Computational Engines & Algorithms
* [11 - Delivery Dispatch & Batching Engine](file:///Users/jarvis/startup/docs/03-core-engines-and-algorithms/11-delivery-dispatch-and-batching-engine.md): Bipartite matching with Hungarian cost minimization, 4 strict order batching guardrails, TSP route sequence optimization, and cost formulation.
* [12 - Recommendation & Personalization Engine](file:///Users/jarvis/startup/docs/03-core-engines-and-algorithms/12-recommendation-and-personalization-engine.md): 3-stage funnel (Retrieval -> Scoring -> Business Re-ranking), Two-Tower deep embeddings, Feast/Redis feature store, and cold-start solutions.
* [13 - Dynamic Pricing, Surge & ETA Engine](file:///Users/jarvis/startup/docs/03-core-engines-and-algorithms/13-dynamic-pricing-surge-and-eta-engine.md): Mathematical surge formulation with bounded caps, weather penalties, ML-based Food Prep Time (FPT) prediction, and TypeScript code.
* [14 - Search Catalog & Fuzzy Matching Engine](file:///Users/jarvis/startup/docs/03-core-engines-and-algorithms/14-search-catalog-and-fuzzy-matching-engine.md): OpenSearch index mapping, Edge-Ngram autocomplete tokenizers, phonetic Double Metaphone analyzers, and Gaussian distance decay scoring.

### Module 04: Low-Level Design (LLD) & Data Models
* [15 - Complete PostgreSQL Database Schema](file:///Users/jarvis/startup/docs/04-low-level-design-data-models/15-complete-postgresql-database-schema.md): Complete DDL scripts, PostGIS spatial indexing, ENUM types, relational integrity constraints, and ER diagram.
* [16 - API Contracts: REST & gRPC](file:///Users/jarvis/startup/docs/04-low-level-design-data-models/16-api-contracts-rest-and-grpc.md): RESTful JSON:API endpoints with idempotent headers and internal high-speed gRPC Protobuf definitions.
* [17 - Caching Tier: Redis Cluster & In-Memory](file:///Users/jarvis/startup/docs/04-low-level-design-data-models/17-caching-tier-redis-and-in-memory-stores.md): 3-tier caching topology, key namespace designs, cache-aside invalidation, and atomic inventory Lua scripts.

### Module 05: Scalability & Infrastructure
* [18 - Database Partitioning, Sharding & Replication](file:///Users/jarvis/startup/docs/05-scalability-infrastructure/18-database-partitioning-sharding-replication.md): Geographic sharding by `city_id`, monthly declarative range partitioning for orders, and PgBouncer transaction-mode pooling.
* [19 - Kafka Event-Driven Architecture](file:///Users/jarvis/startup/docs/05-scalability-infrastructure/19-kafka-event-driven-architecture.md): Topic taxonomy, partition key ordering guarantees, consumer groups, Dead-Letter Queues (DLQ), and Protobuf schema registry.
* [20 - Observability, Resilience & Circuit Breakers](file:///Users/jarvis/startup/docs/05-scalability-infrastructure/20-observability-resilience-circuit-breakers.md): The Three Pillars (Prometheus, Jaeger tracing, Loki logs), Resilience4j circuit breaker state machine, and bulkhead isolation pools.
* [21 - Payment Gateway Integration & Security](file:///Users/jarvis/startup/docs/05-scalability-infrastructure/21-payment-gateway-integration-and-security.md): Active-Active dual gateway (Razorpay + Stripe), HMAC SHA-256 webhook cryptographic verification, PCI-DSS compliance, and anti-fraud velocity limits.

### Module 06: Web Platform Implementation & Roadmap
* [22 - Web Frontend Architecture: Next.js](file:///Users/jarvis/startup/docs/06-web-platform-implementation/22-web-frontend-architecture-nextjs.md): Next.js 14 App Router, React Server Components vs Client Components, Zustand cart store, TanStack Query, and PWA setup.
* [23 - Backend Tech Stack Decision Matrix](file:///Users/jarvis/startup/docs/06-web-platform-implementation/23-backend-tech-stack-decision-matrix.md): Node.js/TypeScript vs Go vs Java evaluation matrix, polyglot tiering strategy, and the modular monolith MVP shortcut.
* [24 - Future Hyperlocal & Campus Plug-in Architecture](file:///Users/jarvis/startup/docs/06-web-platform-implementation/24-future-hyperlocal-plug-in-architecture.md): Seamlessly extending the core platform to college campuses, hostels, and gated societies with room delivery, student runners, and flat ₹40–50/day vendor subscriptions.
* [25 - MVP to Hyper-Scale Execution Roadmap](file:///Users/jarvis/startup/docs/06-web-platform-implementation/25-mvp-to-hyper-scale-execution-roadmap.md): 24-week Gantt timeline, 4-phase rollout plan, and monthly infrastructure cloud cost projections from MVP to 100k daily orders.

### Module 07: The Building Phase Developer Guide (Executable & Hands-On)
* [26 - Local Development Docker Compose Setup](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/26-local-development-docker-compose-setup.md): Complete multi-service Docker Compose running PostgreSQL 15 + PostGIS, PgBouncer, Redis 7, Kafka (KRaft), Kafka UI, and OpenSearch.
* [27 - Database Migrations & Comprehensive Seed Data](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/27-database-migrations-and-seed-data.md): Complete SQL migration scripts and an automated TypeScript seeding script populating authentic Delhi-NCR restaurants, coordinates, menus, and users.
* [28 - Backend Scaffolding: Fastify & Clean Architecture](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/28-backend-scaffolding-fastify-clean-architecture.md): Clean Architecture (Controllers $\to$ Services $\to$ Repositories), Fastify server bootstrap, Zod environment validation, and error envelopes.
* [29 - Order Checkout & Idempotency Implementation](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/29-order-checkout-and-idempotency-implementation.md): End-to-end checkout service with atomic Redis idempotency locks (`SET NX EX`), authoritative DB pricing, and transactional outbox.
* [30 - Razorpay Payment Integration & Webhook Handler](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/30-razorpay-payment-integration-and-webhook-handler.md): Razorpay order generation, HMAC SHA-256 webhook cryptographic verification, and Next.js client payment trigger.
* [31 - Real-Time Tracking: SSE & WebSockets Implementation](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/31-realtime-tracking-sse-and-websockets-implementation.md): Fastify Server-Sent Events (SSE) streaming endpoint and React `useOrderTracking` hook with 60fps LERP marker smoothing.
* [32 - Uber H3 Geospatial Dispatch Service Implementation](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/32-uber-h3-geospatial-dispatch-service-implementation.md): Complete runnable dispatch service using `h3-js`, Redis GEO, and bipartite cost matrix evaluation for rider allocation.
* [33 - Next.js Frontend Scaffolding & Cart Implementation](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/33-nextjs-frontend-scaffolding-and-cart-implementation.md): App Router structure, responsive DishCard components, and persistent Zustand bottom drawer cart.
* [34 - Production Deployment: Kubernetes & Terraform Blueprint](file:///Users/jarvis/startup/docs/07-building-phase-developer-guide/34-production-deployment-kubernetes-and-terraform.md): Multi-AZ AWS EKS cluster with Graviton ARM64 nodes, Horizontal Pod Autoscaler (HPA), Aurora Postgres, and GitHub Actions CI/CD.
