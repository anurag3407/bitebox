# Runbook: Database Unavailable

## 1. Symptoms
- Web application logs reporting `ConnectionRefused` or `PoolTimeout` errors on port 5432.
- HTTP 500 errors returned on quote generation, checkout, and order queries.
- Worker process exiting or pausing with database connectivity alerts.

## 2. Safe Immediate Action
- Check Supabase management dashboard for host status, CPU saturation, or active maintenance.
- Temporarily pause incoming new checkout requests to prevent cascading connection pool exhaustion.
- Verify whether connection pooling limit (PgBouncer) was exceeded.

## 3. Commands / Dashboard References
```bash
# Check connection from VPS to database
pg_isready -d "$DATABASE_URL"
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
```

## 4. Forbidden Actions
- DO NOT restart database host forcefully while active write transactions are pending if avoidable.
- DO NOT alter table schemas during connectivity degradation.

## 5. Escalation Owner
- Database Administrator (DBA) & Backend Technical Lead.

## 6. Recovery Verification
- Execute `pnpm --filter @startup/database typecheck` and verify database ping queries execute in <10ms.
- Confirm connection pool metrics normalize to <50% pool capacity.

## 7. Customer Communication
- "Our ordering system is temporarily unavailable due to upstream database maintenance. Please check back in a few minutes."
