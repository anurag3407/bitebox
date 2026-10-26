import { DomainError, LedgerAccountType } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { LedgerRepository } from "./ledger.repository.js";

export interface InsurancePolicyRow {
  id: string;
  riderId: string;
  planCode: string;
  planName: string;
  coveragePaise: number;
  hospitalCashPaise: number;
  status: string;
  validFrom: string;
  validUntil: string;
}

export interface InsuranceClaimRow {
  id: string;
  policyId: string;
  riderId: string;
  incidentType: string;
  incidentDate: string;
  description: string;
  claimedPaise: number;
  approvedPaise?: number;
  status: string;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
  riderName?: string;
  riderPhone?: string;
}

const COVERAGE_PAISE = 50_000_000;
const HOSPITAL_CASH_PAISE = 5_000_000;

function mapPolicy(r: any): InsurancePolicyRow {
  return {
    id: r.id,
    riderId: r.rider_id,
    planCode: r.plan_code,
    planName: r.plan_name,
    coveragePaise: r.coverage_paise,
    hospitalCashPaise: r.hospital_cash_paise,
    status: r.status,
    validFrom: (r.valid_from as Date).toISOString(),
    validUntil: (r.valid_until as Date).toISOString(),
  };
}

function mapClaim(r: any): InsuranceClaimRow {
  return {
    id: r.id,
    policyId: r.policy_id,
    riderId: r.rider_id,
    incidentType: r.incident_type,
    incidentDate: String(r.incident_date).slice(0, 10),
    description: r.description,
    claimedPaise: r.claimed_paise,
    approvedPaise: r.approved_paise ?? undefined,
    status: r.status,
    reviewNote: r.review_note ?? undefined,
    reviewedAt: r.reviewed_at ? (r.reviewed_at as Date).toISOString() : undefined,
    createdAt: (r.created_at as Date).toISOString(),
    riderName: r.rider_name ?? undefined,
    riderPhone: r.rider_phone ?? undefined,
  };
}

/** Platform-funded accident cover for verified delivery partners. */
export class RiderInsuranceRepository {
  static async overview(riderId: string) {
    const [policy, claims] = await Promise.all([
      getDbPool().query(`SELECT * FROM rider_insurance_policies WHERE rider_id = $1`, [riderId]),
      getDbPool().query(
        `SELECT * FROM rider_insurance_claims WHERE rider_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [riderId]
      ),
    ]);
    return {
      policy: policy.rows[0] ? mapPolicy(policy.rows[0]) : null,
      claims: claims.rows.map(mapClaim),
    };
  }

  /** Idempotent activation/renewal; only KYC-verified partners are eligible. */
  static async enroll(riderId: string): Promise<InsurancePolicyRow> {
    const pool = getDbPool();
    const rider = await pool.query(`SELECT verification_status FROM riders WHERE id = $1`, [riderId]);
    if (!rider.rows[0]) throw new DomainError("NOT_FOUND", "Rider not found");
    if (rider.rows[0].verification_status !== "VERIFIED") {
      throw new DomainError("FORBIDDEN", "Complete KYC verification before activating cover");
    }
    const res = await pool.query(
      `INSERT INTO rider_insurance_policies
         (rider_id, plan_code, plan_name, coverage_paise, hospital_cash_paise, valid_until)
       VALUES ($1, 'PARTNER_ACCIDENT', 'Partner Accident Cover', $2, $3, NOW() + interval '1 year')
       ON CONFLICT (rider_id) DO UPDATE SET
         status = 'ACTIVE', coverage_paise = EXCLUDED.coverage_paise,
         hospital_cash_paise = EXCLUDED.hospital_cash_paise,
         valid_from = NOW(), valid_until = EXCLUDED.valid_until
       RETURNING *`,
      [riderId, COVERAGE_PAISE, HOSPITAL_CASH_PAISE]
    );
    return mapPolicy(res.rows[0]);
  }

  static async fileClaim(input: {
    riderId: string;
    incidentType: "ACCIDENT" | "HOSPITALIZATION" | "VEHICLE_DAMAGE" | "OTHER";
    incidentDate: string;
    description: string;
    claimedPaise: number;
  }): Promise<InsuranceClaimRow> {
    if (!Number.isInteger(input.claimedPaise) || input.claimedPaise < 10000) {
      throw new DomainError("VALIDATION_ERROR", "Claim amount must be at least ₹100");
    }
    if (input.description.trim().length < 20) {
      throw new DomainError("VALIDATION_ERROR", "Describe the incident in at least 20 characters");
    }
    const incident = new Date(`${input.incidentDate}T00:00:00.000Z`);
    if (Number.isNaN(incident.getTime()) || incident.getTime() > Date.now()) {
      throw new DomainError("VALIDATION_ERROR", "Incident date cannot be in the future");
    }
    return withTransaction(async (client) => {
      const policyRes = await client.query(`SELECT * FROM rider_insurance_policies WHERE rider_id = $1 FOR UPDATE`, [
        input.riderId,
      ]);
      const policy = policyRes.rows[0];
      if (!policy || policy.status !== "ACTIVE" || new Date(policy.valid_until).getTime() <= Date.now()) {
        throw new DomainError("STATE_CONFLICT", "Activate your partner cover before filing a claim");
      }
      if (input.incidentDate < new Date(policy.valid_from).toISOString().slice(0, 10)) {
        throw new DomainError("VALIDATION_ERROR", "The incident happened before your cover started");
      }
      if (input.claimedPaise > policy.coverage_paise) {
        throw new DomainError("VALIDATION_ERROR", "Claim exceeds your cover amount");
      }
      const res = await client.query(
        `INSERT INTO rider_insurance_claims
           (policy_id, rider_id, incident_type, incident_date, description, claimed_paise)
         VALUES ($1, $2, $3, $4::date, $5, $6) RETURNING *`,
        [policy.id, input.riderId, input.incidentType, input.incidentDate, input.description.trim(), input.claimedPaise]
      );
      return mapClaim(res.rows[0]);
    });
  }

  static async listClaims(status?: string): Promise<InsuranceClaimRow[]> {
    const res = await getDbPool().query(
      `SELECT c.*, r.name AS rider_name, r.phone AS rider_phone
         FROM rider_insurance_claims c JOIN riders r ON r.id = c.rider_id
        WHERE ($1::text IS NULL OR c.status = $1)
        ORDER BY CASE c.status WHEN 'PENDING' THEN 0 ELSE 1 END, c.created_at DESC
        LIMIT 100`,
      [status ?? null]
    );
    return res.rows.map(mapClaim);
  }

  static async reviewClaim(input: {
    claimId: string;
    adminId: string;
    status: "APPROVED" | "REJECTED";
    approvedPaise?: number;
    note?: string;
  }): Promise<InsuranceClaimRow> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `SELECT c.*, p.coverage_paise
           FROM rider_insurance_claims c JOIN rider_insurance_policies p ON p.id = c.policy_id
          WHERE c.id = $1 FOR UPDATE`,
        [input.claimId]
      );
      const claim = res.rows[0];
      if (!claim) throw new DomainError("NOT_FOUND", "Claim not found");
      if (claim.status !== "PENDING") throw new DomainError("STATE_CONFLICT", "This claim has already been reviewed");

      let approvedPaise: number | null = null;
      if (input.status === "APPROVED") {
        const candidate = input.approvedPaise ?? claim.claimed_paise;
        if (
          !Number.isInteger(candidate) ||
          candidate <= 0 ||
          candidate > claim.claimed_paise ||
          candidate > claim.coverage_paise
        ) {
          throw new DomainError("VALIDATION_ERROR", "Approved amount must be within the claim and cover amount");
        }
        approvedPaise = candidate;
      } else if (!input.note?.trim()) {
        throw new DomainError("VALIDATION_ERROR", "Add a note explaining the rejection");
      }

      const updated = await client.query(
        `UPDATE rider_insurance_claims
            SET status = $2, approved_paise = $3, review_note = $4,
                reviewed_by = $5, reviewed_at = NOW()
          WHERE id = $1 RETURNING *`,
        [claim.id, input.status, approvedPaise, input.note?.trim() || null, input.adminId]
      );
      if (input.status === "APPROVED" && approvedPaise) {
        await LedgerRepository.postTransactionWithClient(client, {
          effectType: "ADJUSTMENT",
          entries: [
            {
              account: LedgerAccountType.RIDER_INSURANCE_EXPENSE,
              debitPaise: approvedPaise,
              creditPaise: 0,
              description: `Insurance claim ${claim.id} approved`,
            },
            {
              account: LedgerAccountType.RIDER_PAYABLE,
              debitPaise: 0,
              creditPaise: approvedPaise,
              description: "Insurance claim payable to rider",
            },
          ],
        });
      }
      return mapClaim(updated.rows[0]);
    });
  }
}
