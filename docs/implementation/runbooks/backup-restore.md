# Runbook: Backup Restore & Recovery Quarantine

## 1. Symptoms
- Data corruption, accidental table truncate, catastrophic hardware failure, or security disaster requiring restoration from a historical PostgreSQL snapshot.

## 2. Safe Immediate Action
- Put the entire platform into **Quarantine Maintenance Mode** (`MAINTENANCE_MODE=true`).
- Terminate all active web and worker containers to prevent conflicting writes during restore.
- Obtain the latest verified backup file from `/var/backups/bitebox/` or cloud storage.
- Execute restoration into an **isolated quarantine database** first (`infra/scripts/restore.sh`).

## 3. Commands / Dashboard References
```bash
# 1. Stop background workers and web servers
docker compose -f /opt/bitebox/infra/compose/docker-compose.yml stop web worker

# 2. Restore backup into quarantine target database
./infra/scripts/restore.sh /var/backups/bitebox/bitebox_db_LATEST.sql.gz "$RECOVERY_DB_URL"
```

## 4. Forbidden Actions
- DO NOT restore a historical database snapshot directly over the production database without first auditing post-checkpoint payment captures and physical food deliveries.
- DO NOT blindly replay expired worker jobs (e.g. merchant timeouts or OTP delivery SMS) from hours ago.

## 5. Escalation Owner
- Head of Infrastructure, Database Architect & Financial Controller.

## 6. Recovery Verification
- Reconcile orders placed between snapshot time and recovery time with Razorpay settlement reports.
- Mark stale unfulfilled orders with appropriate compensation and clear obsolete running jobs.
- Switch production `DATABASE_URL` to the reconciled database and restart services.

## 7. Customer Communication
- "We have completed scheduled maintenance to ensure data integrity. Any orders affected during this window have been fully reconciled or refunded."
