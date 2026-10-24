export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface DropCandidate extends GeoPoint {
  id: string;
  name: string;
  bagCount?: number;
}

export interface SequencedDrop extends DropCandidate {
  sequence: number;
  legMeters: number;
}

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusMeters = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Nearest-neighbour route from the anchor kitchen through each gate/drop point. */
export function sequenceDropPoints(pickup: GeoPoint, drops: DropCandidate[]): SequencedDrop[] {
  const remaining = [...drops];
  const ordered: SequencedDrop[] = [];
  let current: GeoPoint = pickup;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (!candidate) continue;
      const distance = haversineMeters(current, candidate);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    if (!next) break;
    ordered.push({ ...next, sequence: ordered.length + 1, legMeters: bestDistance });
    current = next;
  }
  return ordered;
}

export interface BatchManifestDrop {
  dropPointId: string;
  sequence: number;
  bagCount: number;
  captainFeePerBagPaise: number;
  captainFeePaise: number;
  qrPayload: string;
}

export interface BatchManifest {
  batchId: string;
  totalBags: number;
  drops: BatchManifestDrop[];
  captainPayablePaise: number;
}

export function captainPayable(bagCount: number, feePerBagPaise: number): number {
  if (!Number.isInteger(bagCount) || bagCount < 0) throw new Error("bagCount must be a non-negative integer");
  if (!Number.isInteger(feePerBagPaise) || feePerBagPaise < 0) throw new Error("fee must be non-negative");
  return bagCount * feePerBagPaise;
}

/**
 * Builds the rider/captain manifest after the cutoff lock. The master QR is scannable
 * once; individual bag pickup codes live on each order's existing pickup OTP.
 */
export function buildBatchManifest(input: {
  batchId: string;
  pickup: GeoPoint;
  drops: DropCandidate[];
  captainFeePerBagPaise?: number;
}): BatchManifest {
  const feePerBag = input.captainFeePerBagPaise ?? 300;
  const sequenced = sequenceDropPoints(input.pickup, input.drops);
  const drops = sequenced.map((drop) => {
    const bagCount = Math.max(1, drop.bagCount ?? 1);
    return {
      dropPointId: drop.id,
      sequence: drop.sequence,
      bagCount,
      captainFeePerBagPaise: feePerBag,
      captainFeePaise: captainPayable(bagCount, feePerBag),
      qrPayload: `BATCH:${input.batchId}:DROP:${drop.id}:BAGS:${bagCount}`,
    };
  });
  const totalBags = drops.reduce((sum, drop) => sum + drop.bagCount, 0);
  return {
    batchId: input.batchId,
    totalBags,
    drops,
    captainPayablePaise: drops.reduce((sum, drop) => sum + drop.captainFeePaise, 0),
  };
}
