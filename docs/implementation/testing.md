# Testing Strategy & Verification Guide

## 1. Test Suite Architecture

The platform features automated testing across three tiers:
1. **Pure Unit Tests (`packages/core`, `packages/contracts`)**: Run in-memory in milliseconds with zero database or network dependencies.
2. **Database Integration Tests (`packages/database`)**: Run against real PostgreSQL 15, executing migrations, seed queries, and transactional repository methods.
3. **Background Worker Tests (`apps/worker`)**: Validate lease acquisition, job execution, timeout triggers, and automatic cancellation refunds.

---

## 2. Executing Test Suites

```bash
# Run all automated tests across monorepo
pnpm test

# Run pure domain unit tests
pnpm test:unit

# Run contracts validation tests
pnpm test:contracts

# Run PostgreSQL integration tests
pnpm test:integration

# Run strict TypeScript typecheck
pnpm typecheck

# Build production artifacts (Next.js & Worker)
pnpm build
```

---

## 3. Test Coverage Highlights

- **Money Calculations**: Zero drift, integer paise multiplication, rounding rules, percentage basis points.
- **State Machine Transitions**: Valid forward progression, rejection of invalid backward or skipped jumps, terminal state sealing.
- **Modifier Constraints**: Enforcing minimum required selections and maximum caps across modifier groups.
- **PostgreSQL SKIP LOCKED**: Concurrent worker claims verifying no two workers claim the same background job.
- **Durable Idempotency**: Repeated checkout submissions returning identical order records without creating duplicate charges.
