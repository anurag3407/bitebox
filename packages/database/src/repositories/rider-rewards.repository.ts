import { DomainError, LedgerAccountType } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { LedgerRepository } from "./ledger.repository.js";

export interface RiderIncentiveView {
  id: string;
  code: string;
  title: string;
  description: string;
  targetDeliveries: number;
  progressDeliveries: number;
  rewardPaise: number;
  startsAt: string;
  endsAt: string;
  canClaim: boolean;
  claimedAt?: string;
}

export interface RiderShiftView {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  isBooked: boolean;
  canBook: boolean;
  canCancel: boolean;
}

export interface RiderRewardsOverview {
  incentives: RiderIncentiveView[];
  shifts: RiderShiftView[];
  deliveredToday: number;
  claimedBonusPaise: number;
}

/**
 * Rider growth loop: delivery-count quests that pay a bonus into the next payout,
 * plus capacity-limited shift slots so supply can be planned ahead of demand.
 */
export class RiderRewardsRepository {
  static async overview(riderId: string): Promise<RiderRewardsOverview> {
    const pool = getDbPool();
    const [incentives, claims, shifts] = await Promise.all([
      pool.query(
        `SELECT * FROM rider_incentives
          WHERE is_active AND ends_at > NOW() AND starts_at < NOW() + INTERVAL '30 days'
          ORDER BY ends_at ASC LIMIT 12`
      ),
      pool.query(`SELECT incentive_id, claimed_at FROM rider_incentive_claims WHERE rider_id = $1`, [riderId]),
      pool.query(
        `SELECT * FROM rider_shifts
          WHERE is_active AND ends_at > NOW()
          ORDER BY starts_at ASC LIMIT 20`
      ),
    ]);
    const [bookings, own, deliveredToday, claimedBonus] = await Promise.all([
      pool.query(
        `SELECT shift_id, status, COUNT(*) FILTER (WHERE status = 'BOOKED') OVER (PARTITION BY shift_id)::int AS booked_count
           FROM rider_shift_bookings
          WHERE shift_id = ANY($1::uuid[])`,
        [shifts.rows.map((r) => r.id)]
      ),
      pool.query(
        `SELECT shift_id FROM rider_shift_bookings WHERE rider_id = $1 AND status = 'BOOKED'`,
        [riderId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM delivery_assignments
          WHERE rider_id = $1 AND status = 'COMPLETED' AND completed_at >= date_trunc('day', NOW())`,
        [riderId]
      ),
      pool.query(`SELECT COALESCE(SUM(reward_paise), 0)::int AS total FROM rider_incentive_claims WHERE rider_id = $1`, [riderId]),
    ]);

    const claimMap = new Map<string, Date>(claims.rows.map((r) => [r.incentive_id as string, r.claimed_at as Date]));
    const bookedByShift = new Map<string, number>();
    for (const row of bookings.rows) {
      if (row.status === "BOOKED") bookedByShift.set(row.shift_id, Number(row.booked_count));
    }
    const ownBooked = new Set<string>(own.rows.map((r) => r.shift_id as string));

    const now = Date.now();
    const progress = await pool.query(
      `SELECT i.id, COUNT(da.id)::int AS delivered
         FROM rider_incentives i
         LEFT JOIN delivery_assignments da
           ON da.rider_id = $1 AND da.status = 'COMPLETED'
          AND da.completed_at >= i.starts_at AND da.completed_at <= i.ends_at
        WHERE i.id = ANY($2::uuid[])
        GROUP BY i.id`,
      [riderId, incentives.rows.map((r) => r.id)]
    );
    const progressMap = new Map<string, number>(progress.rows.map((r) => [r.id as string, Number(r.delivered)]));

    return {
      incentives: incentives.rows.map((r) => {
        const claimedAt = claimMap.get(r.id);
        const delivered = progressMap.get(r.id) ?? 0;
        const active = new Date(r.starts_at).getTime() <= now && new Date(r.ends_at).getTime() > now;
        return {
          id: r.id,
          code: r.code,
          title: r.title,
          description: r.description,
          targetDeliveries: r.target_deliveries,
          progressDeliveries: Math.min(delivered, r.target_deliveries),
          rewardPaise: r.reward_paise,
          startsAt: (r.starts_at as Date).toISOString(),
          endsAt: (r.ends_at as Date).toISOString(),
          canClaim: active && !claimedAt && delivered >= r.target_deliveries,
          claimedAt: claimedAt?.toISOString(),
        };
      }),
      shifts: shifts.rows.map((r) => {
        const booked = bookedByShift.get(r.id) ?? 0;
        const isBooked = ownBooked.has(r.id);
        const upcoming = new Date(r.starts_at).getTime() > now;
        return {
          id: r.id,
          label: r.label,
          startsAt: (r.starts_at as Date).toISOString(),
          endsAt: (r.ends_at as Date).toISOString(),
          capacity: r.capacity,
          bookedCount: booked,
          spotsLeft: Math.max(0, r.capacity - booked),
          isBooked,
          canBook: upcoming && !isBooked && booked < r.capacity,
          canCancel: isBooked && upcoming,
        };
      }),
      deliveredToday: Number(deliveredToday.rows[0]?.count ?? 0),
      claimedBonusPaise: Number(claimedBonus.rows[0]?.total ?? 0),
    };
  }

  static async claimIncentive(riderId: string, incentiveId: string): Promise<{ claimId: string; rewardPaise: number }> {
    return withTransaction(async (client) => {
      const incentive = await client.query(`SELECT * FROM rider_incentives WHERE id = $1 AND is_active FOR UPDATE`, [incentiveId]);
      const row = incentive.rows[0];
      if (!row) throw new DomainError("NOT_FOUND", "This incentive is no longer available");
      const now = Date.now();
      if (now < new Date(row.starts_at).getTime() || now >= new Date(row.ends_at).getTime()) {
        throw new DomainError("STATE_CONFLICT", "This incentive window is closed");
      }
      const delivered = await client.query(
        `SELECT COUNT(*)::int AS count FROM delivery_assignments da
          WHERE da.rider_id = $1 AND da.status = 'COMPLETED'
            AND da.completed_at >= $2 AND da.completed_at <= $3`,
        [riderId, row.starts_at, row.ends_at]
      );
      const count = Number(delivered.rows[0]?.count ?? 0);
      if (count < row.target_deliveries) {
        throw new DomainError("VALIDATION_ERROR", `Complete ${row.target_deliveries - count} more deliveries to claim this bonus`, {
          details: { deliveries: count, target: row.target_deliveries },
        });
      }
      const claim = await client.query(
        `INSERT INTO rider_incentive_claims (incentive_id, rider_id, reward_paise, deliveries_at_claim)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (incentive_id, rider_id) DO NOTHING
         RETURNING id`,
        [incentiveId, riderId, row.reward_paise, count]
      );
      if (!claim.rows[0]) throw new DomainError("STATE_CONFLICT", "You have already claimed this bonus");
      const claimId: string = claim.rows[0].id;
      await LedgerRepository.postTransactionWithClient(client, {
        effectType: "INCENTIVE",
        entries: [
          {
            account: LedgerAccountType.RIDER_INCENTIVE_EXPENSE,
            debitPaise: row.reward_paise,
            creditPaise: 0,
            description: `${row.title} bonus earned`,
          },
          {
            account: LedgerAccountType.RIDER_PAYABLE,
            debitPaise: 0,
            creditPaise: row.reward_paise,
            description: `${row.title} bonus payable to rider`,
          },
        ],
      });
      return { claimId, rewardPaise: row.reward_paise as number };
    });
  }

  static async bookShift(riderId: string, shiftId: string): Promise<{ bookingId: string }> {
    return withTransaction(async (client) => {
      const shift = await client.query(`SELECT * FROM rider_shifts WHERE id = $1 AND is_active FOR UPDATE`, [shiftId]);
      const row = shift.rows[0];
      if (!row) throw new DomainError("NOT_FOUND", "This shift is no longer available");
      if (new Date(row.starts_at).getTime() <= Date.now()) {
        throw new DomainError("STATE_CONFLICT", "This shift has already started");
      }
      const overlap = await client.query(
        `SELECT 1 FROM rider_shift_bookings b
           JOIN rider_shifts s ON s.id = b.shift_id
          WHERE b.rider_id = $1 AND b.status = 'BOOKED' AND b.shift_id <> $2
            AND s.starts_at < $4 AND s.ends_at > $3
          LIMIT 1`,
        [riderId, shiftId, row.starts_at, row.ends_at]
      );
      if (overlap.rows.length) throw new DomainError("STATE_CONFLICT", "You already have a shift during this window");
      const booked = await client.query(
        `SELECT COUNT(*)::int AS count FROM rider_shift_bookings WHERE shift_id = $1 AND status = 'BOOKED'`,
        [shiftId]
      );
      const existing = await client.query(
        `SELECT status FROM rider_shift_bookings WHERE shift_id = $1 AND rider_id = $2`,
        [shiftId, riderId]
      );
      if (existing.rows[0]?.status === "BOOKED") throw new DomainError("STATE_CONFLICT", "You already booked this shift");
      if (Number(booked.rows[0]?.count ?? 0) >= row.capacity) {
        throw new DomainError("STATE_CONFLICT", "This shift is full");
      }
      const res = await client.query(
        `INSERT INTO rider_shift_bookings (shift_id, rider_id, status)
         VALUES ($1, $2, 'BOOKED')
         ON CONFLICT (shift_id, rider_id) DO UPDATE
           SET status = 'BOOKED', booked_at = NOW(), cancelled_at = NULL
           WHERE rider_shift_bookings.status = 'CANCELLED'
         RETURNING id`,
        [shiftId, riderId]
      );
      if (!res.rows[0]) throw new DomainError("STATE_CONFLICT", "You already booked this shift");
      return { bookingId: res.rows[0].id as string };
    });
  }

  static async cancelShift(riderId: string, shiftId: string): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE rider_shift_bookings b
            SET status = 'CANCELLED', cancelled_at = NOW()
           FROM rider_shifts s
          WHERE b.shift_id = s.id AND b.shift_id = $1 AND b.rider_id = $2
            AND b.status = 'BOOKED' AND s.starts_at > NOW()
          RETURNING b.id`,
        [shiftId, riderId]
      );
      if (!res.rows[0]) throw new DomainError("STATE_CONFLICT", "This shift can no longer be cancelled");
    });
  }
}
