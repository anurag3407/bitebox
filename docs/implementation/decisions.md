# Architecture Decision Records (ADRs)

## ADR 001: Integer Paise for Financial Calculations
- **Status**: Accepted
- **Context**: JavaScript IEEE 754 floating-point arithmetic introduces rounding inaccuracies (e.g., `0.1 + 0.2 !== 0.3`) which cause reconciliation discrepancies and accounting mismatches.
- **Decision**: All currency calculations, storage columns, and API DTO representations are expressed as non-negative integer paise (`1 INR = 100 paise`). Currency formatting into rupees (`₹`) is performed strictly at the edge UI layer.
- **Consequences**: Zero floating point drift; strict algebraic invariance across order quotes, payment captures, tax invoices, and double-entry ledger entries.

---

## ADR 002: Modular Monolith with Shared Packages over Microservices
- **Status**: Accepted
- **Context**: The platform requires rapid iteration and high performance without the operational overhead, network latency, distributed transaction complexity, and multi-repo coordination of microservices.
- **Decision**: Build as a single TypeScript monorepo with pnpm workspaces. Enforce domain boundaries through dedicated packages (`@startup/core`, `@startup/contracts`, `@startup/database`, `@startup/integrations`) that are imported directly by the Next.js web application and the durable worker daemon.
- **Consequences**: Atomic commits across backend, frontend, and contracts; single deployment pipeline; clean internal interfaces ready for future extraction if load requires.

---

## ADR 003: Durable PostgreSQL Job Queue (`SKIP LOCKED`) over Redis-Only Queues
- **Status**: Accepted
- **Context**: Background jobs (such as order merchant acceptance timeouts, automated cancellation refunds, and retryable webhook processing) must not be lost upon process restarts or Redis cache evictions.
- **Decision**: Store job queue items in PostgreSQL with state tracking (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`) and lease timeouts. Workers claim available jobs using `SELECT ... FOR UPDATE SKIP LOCKED`.
- **Consequences**: ACID transactional consistency between business entity mutations and job creation (Transactional Outbox); zero risk of lost financial jobs; Redis remains an ephemeral accelerator.

---

## ADR 004: Single Active Order per Rider Dispatch Policy
- **Status**: Accepted
- **Context**: Multi-order batching introduces complex routing dependencies, delivery delays, cold food complaints, and dispute arbitration overhead during initial operations.
- **Decision**: Enforce a strict single active order per rider dispatch invariant (`MAX_ACTIVE_ORDERS = 1`). A rider can only receive new delivery trip offers when they are marked online with zero active trips.
- **Consequences**: Deterministic customer ETAs, higher customer satisfaction, simplified OTP delivery handshakes, and predictable fleet logistics.

---

## ADR 005: Dual Spatial Engine (PostGIS SQL + Pure TypeScript Haversine/PIP)
- **Status**: Accepted
- **Context**: While PostGIS is the gold standard for geospatial spatial geometry in PostgreSQL, developer local machines or testing environments might lack the native C PostGIS extension.
- **Decision**: Implement spatial polygons and distances using dual capabilities: PostGIS SQL spatial expressions when available, and pure mathematical Haversine distance and ray-casting Point-in-Polygon (PIP) algorithms in `@startup/core/serviceability` as an authoritative fallback.
- **Consequences**: Seamless local developer experience on any standard PostgreSQL instance, zero external deployment blockers, identical mathematical precision.

---

## ADR 006: Clerk Authentication with Fast-Path Persona Switcher
- **Status**: Accepted
- **Context**: Evaluators, engineers, and product stakeholders need the ability to test multi-role user journeys (Customer, Merchant Partner, Rider, Operations Admin) effortlessly in local and staging environments without requiring 4 distinct physical Clerk logins.
- **Decision**: Implement `ClerkAuthAdapter` with support for live Clerk Bearer tokens and designated demo persona tokens (`demo_customer`, `demo_merchant`, `demo_rider`, `demo_admin`). Provide an interactive visual Persona Switcher in the navigation header.
- **Consequences**: Instantaneous role switching across all 4 platform personas with zero friction, while fully preserving production Clerk JWT validation pathways.
