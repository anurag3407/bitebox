import type { PoolClient } from "pg";
import { RiderDocumentType, RiderVerificationStatus } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { AuditRepository } from "./audit.repository.js";
import { OutboxRepository } from "./outbox.repository.js";

export const REQUIRED_RIDER_DOCUMENTS: RiderDocumentType[] = [
  RiderDocumentType.PROFILE_PHOTO,
  RiderDocumentType.AADHAAR,
  RiderDocumentType.DRIVING_LICENSE,
  RiderDocumentType.VEHICLE_RC,
];

export interface RiderDocumentRow {
  id: string;
  docType: RiderDocumentType;
  fileUrl: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface RiderVerificationProfile {
  riderId: string;
  riderName: string;
  phone: string;
  vehicleType: string;
  vehicleNumber?: string;
  isApproved: boolean;
  isOnline: boolean;
  status: RiderVerificationStatus;
  aadhaarLast4?: string;
  panVerified: boolean;
  dlVerified: boolean;
  backgroundCheckStatus: "PENDING" | "CLEAR" | "CONSIDER";
  trainingCompletedAt?: string;
  submittedAt?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  requiredDocs: RiderDocumentType[];
  missingDocs: RiderDocumentType[];
  documents: RiderDocumentRow[];
}

function mapDocument(r: any): RiderDocumentRow {
  return {
    id: r.id,
    docType: r.doc_type,
    fileUrl: r.file_url,
    status: r.status,
    reviewNote: r.review_note ?? undefined,
    reviewedAt: (r.reviewed_at as Date | null)?.toISOString(),
    createdAt: (r.created_at as Date).toISOString(),
  };
}

async function profile(client: Pick<PoolClient, "query">, riderId: string): Promise<RiderVerificationProfile | null> {
  const res = await client.query(
    `SELECT r.*, COALESCE(v.status, r.verification_status) AS verification_status,
            v.aadhaar_last4, v.pan_verified, v.dl_verified, v.background_check_status,
            v.training_completed_at, v.submitted_at, v.verified_at, v.rejection_reason
       FROM riders r LEFT JOIN rider_verifications v ON v.rider_id = r.id
      WHERE r.id = $1`,
    [riderId]
  );
  const r = res.rows[0];
  if (!r) return null;
  const docs = await client.query(`SELECT * FROM rider_documents WHERE rider_id = $1 ORDER BY created_at`, [riderId]);
  const documents = docs.rows.map(mapDocument);
  const present = new Set(documents.map((d) => d.docType));
  return {
    riderId: r.id,
    riderName: r.name,
    phone: r.phone,
    vehicleType: r.vehicle_type,
    vehicleNumber: r.vehicle_number ?? undefined,
    isApproved: r.is_approved,
    isOnline: r.is_online,
    status: r.verification_status,
    aadhaarLast4: r.aadhaar_last4 ?? undefined,
    panVerified: r.pan_verified ?? false,
    dlVerified: r.dl_verified ?? false,
    backgroundCheckStatus: r.background_check_status ?? "PENDING",
    trainingCompletedAt: (r.training_completed_at as Date | null)?.toISOString(),
    submittedAt: (r.submitted_at as Date | null)?.toISOString(),
    verifiedAt: (r.verified_at as Date | null)?.toISOString(),
    rejectionReason: r.rejection_reason ?? undefined,
    requiredDocs: REQUIRED_RIDER_DOCUMENTS,
    missingDocs: REQUIRED_RIDER_DOCUMENTS.filter((d) => !present.has(d)),
    documents,
  };
}

export class RiderVerificationRepository {
  static async getProfile(riderId: string): Promise<RiderVerificationProfile | null> {
    return profile(getDbPool(), riderId);
  }

  static async upsertDocument(riderId: string, docType: RiderDocumentType, fileUrl: string) {
    return withTransaction(async (client) => {
      const rider = await client.query(`SELECT verification_status FROM riders WHERE id = $1 FOR UPDATE`, [riderId]);
      if (!rider.rows[0]) throw new DomainError("NOT_FOUND", "Delivery partner profile not found");
      if (rider.rows[0].verification_status === RiderVerificationStatus.VERIFIED) {
        throw new DomainError("STATE_CONFLICT", "Your documents are already verified. Contact support to change them.");
      }
      await client.query(
        `INSERT INTO rider_documents (rider_id, doc_type, file_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (rider_id, doc_type) DO UPDATE
           SET file_url = EXCLUDED.file_url, status = 'PENDING', review_note = NULL,
               reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()`,
        [riderId, docType, fileUrl]
      );
      await client.query(
        `INSERT INTO rider_verifications (rider_id, status) VALUES ($1, 'PENDING')
         ON CONFLICT (rider_id) DO UPDATE SET
           status = CASE WHEN rider_verifications.status = 'VERIFIED' THEN rider_verifications.status ELSE 'PENDING' END,
           rejection_reason = NULL, updated_at = NOW()`,
        [riderId]
      );
      await client.query(`UPDATE riders SET verification_status = 'PENDING' WHERE id = $1`, [riderId]);
      return (await profile(client, riderId))!;
    });
  }

  /** Submits the file list for review. All mandatory documents must be present first. */
  static async submit(riderId: string, aadhaarLast4: string) {
    return withTransaction(async (client) => {
      const rider = await client.query(`SELECT verification_status, is_online FROM riders WHERE id = $1 FOR UPDATE`, [riderId]);
      if (!rider.rows[0]) throw new DomainError("NOT_FOUND", "Delivery partner profile not found");
      if (rider.rows[0].verification_status === RiderVerificationStatus.VERIFIED) {
        throw new DomainError("STATE_CONFLICT", "You are already verified.");
      }
      const docs = await client.query(`SELECT doc_type, status FROM rider_documents WHERE rider_id = $1`, [riderId]);
      const present = new Set(docs.rows.filter((d) => d.status !== "REJECTED").map((d) => d.doc_type));
      const missing = REQUIRED_RIDER_DOCUMENTS.filter((d) => !present.has(d));
      if (missing.length > 0) {
        throw new DomainError("VALIDATION_ERROR", `Upload all required documents first: ${missing.join(", ")}.`, {
          details: { missingDocs: missing },
        });
      }
      await client.query(
        `INSERT INTO rider_verifications (rider_id, status, aadhaar_last4, submitted_at)
         VALUES ($1, 'IN_REVIEW', $2, NOW())
         ON CONFLICT (rider_id) DO UPDATE SET
           status = 'IN_REVIEW', aadhaar_last4 = EXCLUDED.aadhaar_last4,
           submitted_at = NOW(), rejection_reason = NULL, updated_at = NOW()`,
        [riderId, aadhaarLast4]
      );
      await client.query(
        `UPDATE riders SET verification_status = 'IN_REVIEW', is_online = false WHERE id = $1`,
        [riderId]
      );
      await client.query(
        `UPDATE delivery_offers SET status = 'REVOKED', responded_at = NOW(), response_reason = 'KYC under review'
          WHERE rider_id = $1 AND status = 'OFFERED'`,
        [riderId]
      );
      await OutboxRepository.appendWithClient(client, "rider.verification_submitted", riderId, 1, { riderId });
      return (await profile(client, riderId))!;
    });
  }

  /** Final KYC decision. Approval flips the rider live-capable; rejection keeps them blocked. */
  static async review(
    riderId: string,
    adminId: string,
    decision: "APPROVE" | "REJECT" | "SUSPEND",
    note: string
  ) {
    return withTransaction(async (client) => {
      const rider = await client.query(`SELECT verification_status FROM riders WHERE id = $1 FOR UPDATE`, [riderId]);
      if (!rider.rows[0]) throw new DomainError("NOT_FOUND", "Delivery partner not found");

      if (decision === "APPROVE") {
        const submitted = await client.query(`SELECT submitted_at, status FROM rider_verifications WHERE rider_id = $1`, [riderId]);
        if (!submitted.rows[0]?.submitted_at || submitted.rows[0].status !== "IN_REVIEW") {
          throw new DomainError("STATE_CONFLICT", "The rider has not submitted their KYC for review yet.");
        }
        const docs = await client.query(
          `SELECT doc_type FROM rider_documents WHERE rider_id = $1 AND status <> 'REJECTED'`,
          [riderId]
        );
        const present = new Set(docs.rows.map((d) => d.doc_type as RiderDocumentType));
        const missing = REQUIRED_RIDER_DOCUMENTS.filter((d) => !present.has(d));
        if (missing.length > 0) {
          throw new DomainError("VALIDATION_ERROR", `Missing mandatory documents: ${missing.join(", ")}`);
        }
        const rejectedDocs = await client.query(
          `SELECT COUNT(*)::int AS count FROM rider_documents WHERE rider_id = $1 AND status = 'REJECTED'`,
          [riderId]
        );
        if (rejectedDocs.rows[0].count > 0) {
          throw new DomainError("VALIDATION_ERROR", "Replace or re-upload rejected documents before approving.");
        }
        await client.query(`UPDATE rider_documents SET status = 'VERIFIED', reviewed_by = $2, reviewed_at = NOW() WHERE rider_id = $1 AND status = 'PENDING'`, [riderId, adminId]);
        await client.query(
          `INSERT INTO rider_verifications (rider_id, status, background_check_status, verified_at, training_completed_at)
           VALUES ($1, 'VERIFIED', 'CLEAR', NOW(), NOW())
           ON CONFLICT (rider_id) DO UPDATE SET
             status = 'VERIFIED', background_check_status = 'CLEAR', verified_at = NOW(),
             training_completed_at = COALESCE(rider_verifications.training_completed_at, NOW()),
             rejection_reason = NULL, updated_at = NOW()`,
          [riderId]
        );
        await client.query(`UPDATE riders SET verification_status = 'VERIFIED', is_approved = true WHERE id = $1`, [riderId]);
      } else {
        await client.query(
          `UPDATE rider_verifications SET status = $2, rejection_reason = $3, updated_at = NOW() WHERE rider_id = $1`,
          [riderId, decision === "SUSPEND" ? "SUSPENDED" : "REJECTED", note]
        );
        await client.query(
          `UPDATE riders SET verification_status = $2, is_approved = false, is_online = false WHERE id = $1`,
          [riderId, decision === "SUSPEND" ? "SUSPENDED" : "REJECTED"]
        );
        await client.query(
          `UPDATE delivery_offers SET status = 'REVOKED', responded_at = NOW(), response_reason = 'Rider KYC review'
            WHERE rider_id = $1 AND status = 'OFFERED'`,
          [riderId]
        );
      }
      await AuditRepository.logWithClient(client, {
        adminUserId: adminId,
        action: `RIDER_VERIFICATION_${decision}`,
        targetType: "rider",
        targetId: riderId,
        details: { note },
      });
      await OutboxRepository.appendWithClient(client, "rider.verification_reviewed", riderId, 2, {
        riderId,
        decision,
        note,
      });
      return (await profile(client, riderId))!;
    });
  }

  static async listForAdmin(status?: RiderVerificationStatus) {
    const res = await getDbPool().query(
      `SELECT r.id, r.name, r.phone, r.vehicle_type, r.is_approved, r.verification_status,
              v.submitted_at, v.rejection_reason,
              (SELECT COUNT(*)::int FROM rider_documents d WHERE d.rider_id = r.id) AS doc_count
         FROM riders r LEFT JOIN rider_verifications v ON v.rider_id = r.id
        WHERE ($1::text IS NULL OR r.verification_status = $1)
        ORDER BY (r.verification_status = 'IN_REVIEW') DESC, r.joined_at DESC
        LIMIT 200`,
      [status ?? null]
    );
    return res.rows.map((r) => ({
      riderId: r.id as string,
      name: r.name as string,
      phone: r.phone as string,
      vehicleType: r.vehicle_type as string,
      isApproved: r.is_approved as boolean,
      status: r.verification_status as RiderVerificationStatus,
      submittedAt: (r.submitted_at as Date | null)?.toISOString(),
      rejectionReason: r.rejection_reason ?? undefined,
      documentCount: r.doc_count as number,
    }));
  }
}
