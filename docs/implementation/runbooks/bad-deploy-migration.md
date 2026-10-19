# Runbook: Bad Deployment / Problematic Migration

## 1. Symptoms
- Application crash loop following new release deployment.
- High error rate on core API routes immediately post-deploy.
- Database migration caused lock contention or broke backwards compatibility.

## 2. Safe Immediate Action
- Immediately revert container images to previous stable git tag.
- If a migration was strictly additive (new column, new table), LEAVE schema intact—do not run destructive drops while old app code is running.
- If migration locked tables, terminate blocking query (`pg_terminate_backend`).

## 3. Commands / Dashboard References
```bash
# Roll back to previous release tag
git checkout $(git describe --tags --abbrev=0 HEAD^)
./infra/scripts/deploy.sh
```

## 4. Forbidden Actions
- DO NOT run destructive `DROP COLUMN` or `DROP TABLE` commands in panic.
- DO NOT restart PostgreSQL during heavy DDL lock waits without investigating pg_stat_activity.

## 5. Escalation Owner
- Release Manager & Lead Architect.

## 6. Recovery Verification
- Confirm `/api/v1/health` returns status `ok`.
- Error rates on web routes return to baseline (<0.1%).

## 7. Customer Communication
- None required if rollback completes within 3 minutes; otherwise standard brief maintenance notice.
