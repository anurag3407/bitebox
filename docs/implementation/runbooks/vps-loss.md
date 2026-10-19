# Runbook: VPS Loss / Total Host Failure

## 1. Symptoms
- Complete network unreachability to primary VPS IP.
- Uptime robot / synthetic monitoring firing critical alerts across all endpoints.
- SSH connections timing out.

## 2. Safe Immediate Action
- Point DNS / Cloudflare failover to maintenance splash page displaying incident notice.
- Provision a clean backup VPS instance from target cloud provider.
- Verify primary PostgreSQL data store on Supabase remains intact and uncorrupted.

## 3. Commands / Dashboard References
```bash
# On new VPS: Clone repository and set production environment
git clone https://github.com/org/zomatofresh /opt/zomatofresh
cd /opt/zomatofresh
cp /secure-vault/.env .env
./infra/scripts/deploy.sh
```

## 4. Forbidden Actions
- DO NOT attempt to run destructive data resets or drop database tables.
- DO NOT route traffic before healthchecks pass.

## 5. Escalation Owner
- Lead DevOps / Infrastructure Engineer & Head of Engineering.

## 6. Recovery Verification
- Run `curl -fsS https://zomatofresh.local/api/v1/health`.
- Verify background worker is actively acquiring leases from PostgreSQL `jobs` table.

## 7. Customer Communication
- "We are currently experiencing a brief technical service interruption. Active orders are safely preserved in our system. We anticipate normal service within 15 minutes."
