"use client";

import React, { useId } from "react";
import type { Coordinate } from "@startup/contracts";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const HAS_MAPBOX = !!MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith("pk.") && !MAPBOX_TOKEN.includes("mock") && !MAPBOX_TOKEN.includes("placeholder");

const INK = "111111";
const ACCENT = "F0532D";
const SUCCESS = "15803D";
const STALE = "A3A3A3";

interface TrackingMapProps {
  restaurant?: Coordinate;
  home: Coordinate;
  rider?: Coordinate;
  riderStale?: boolean;
}

/**
 * Lightweight live map. With a Mapbox public token it renders a static map image
 * (re-requested as the rider moves); otherwise a schematic plot of the three points.
 * Avoids shipping a 700 kB map SDK to every customer's phone.
 */
export function TrackingMap({ restaurant, home, rider, riderStale }: TrackingMapProps) {
  const gridId = `grid${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const points = [restaurant, home, rider].filter(Boolean) as Coordinate[];

  if (HAS_MAPBOX) {
    const pin = (c: Coordinate, label: string, color: string) => `pin-l-${label}+${color}(${c.longitude.toFixed(5)},${c.latitude.toFixed(5)})`;
    const overlays = [restaurant && pin(restaurant, "restaurant", ACCENT), pin(home, "building", INK), rider && pin(rider, "scooter", riderStale ? STALE : SUCCESS)]
      .filter(Boolean)
      .join(",");
    const src = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${overlays}/auto/640x320@2x?padding=50&access_token=${MAPBOX_TOKEN}`;
    // eslint-disable-next-line @next/next/no-img-element -- static map URL changes with every rider ping
    return <img src={src} alt="Map showing your order's route" className="aspect-[2/1] w-full rounded-3xl bg-subtle object-cover" />;
  }

  // Schematic: project lat/lng into a padded box
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const pad = 0.002;
  const minLat = Math.min(...lats) - pad,
    maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad,
    maxLng = Math.max(...lngs) + pad;
  const project = (c: Coordinate) => ({
    x: 40 + ((c.longitude - minLng) / (maxLng - minLng || 1)) * 320,
    y: 165 - ((c.latitude - minLat) / (maxLat - minLat || 1)) * 130,
  });
  const r = restaurant && project(restaurant);
  const h = project(home);
  const d = rider && project(rider);
  const riderColor = `#${riderStale ? STALE : SUCCESS}`;

  return (
    <svg viewBox="0 0 400 200" role="img" aria-label="Route overview" className="aspect-[2/1] w-full rounded-3xl bg-subtle">
      <defs>
        <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#DEDEDA" />
        </pattern>
      </defs>
      <rect width="400" height="200" fill={`url(#${gridId})`} />
      {r && <line x1={r.x} y1={r.y} x2={h.x} y2={h.y} stroke={`#${INK}`} strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" opacity="0.35" />}
      {r && (
        <g>
          <circle cx={r.x} cy={r.y} r="10" fill="white" stroke={`#${ACCENT}`} strokeWidth="3" />
          <text x={r.x} y={r.y - 18} textAnchor="middle" fontSize="11" fill={`#${INK}`} opacity="0.6">
            Restaurant
          </text>
        </g>
      )}
      <g>
        <circle cx={h.x} cy={h.y} r="10" fill={`#${INK}`} />
        <circle cx={h.x} cy={h.y} r="3.5" fill="white" />
        <text x={h.x} y={h.y - 18} textAnchor="middle" fontSize="11" fill={`#${INK}`} opacity="0.6">
          You
        </text>
      </g>
      {d && (
        <g>
          <circle cx={d.x} cy={d.y} r="16" fill={riderColor} opacity="0.18" />
          <circle cx={d.x} cy={d.y} r="7" fill={riderColor} stroke="white" strokeWidth="2.5" />
        </g>
      )}
    </svg>
  );
}
