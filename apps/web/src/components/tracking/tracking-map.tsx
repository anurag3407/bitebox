"use client";

import React from "react";
import type { Coordinate } from "@startup/contracts";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const HAS_MAPBOX = !!MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith("pk.") && !MAPBOX_TOKEN.includes("mock") && !MAPBOX_TOKEN.includes("placeholder");

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
  const points = [restaurant, home, rider].filter(Boolean) as Coordinate[];

  if (HAS_MAPBOX) {
    const pin = (c: Coordinate, label: string, color: string) => `pin-l-${label}+${color}(${c.longitude.toFixed(5)},${c.latitude.toFixed(5)})`;
    const overlays = [
      restaurant && pin(restaurant, "restaurant", "D92D47"),
      pin(home, "building", "1F2026"),
      rider && pin(rider, "scooter", riderStale ? "9CA3AF" : "24963F"),
    ]
      .filter(Boolean)
      .join(",");
    const src = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays}/auto/640x320@2x?padding=50&access_token=${MAPBOX_TOKEN}`;
    return <img src={src} alt="Map showing your order's route" className="w-full aspect-[2/1] object-cover rounded-2xl bg-surface-muted" />;
  }

  // Schematic: project lat/lng into a padded box
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const pad = 0.002;
  const minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad, maxLng = Math.max(...lngs) + pad;
  const project = (c: Coordinate) => ({
    x: 30 + ((c.longitude - minLng) / (maxLng - minLng || 1)) * 340,
    y: 170 - ((c.latitude - minLat) / (maxLat - minLat || 1)) * 140,
  });
  const r = restaurant && project(restaurant);
  const h = project(home);
  const d = rider && project(rider);

  return (
    <svg viewBox="0 0 400 200" role="img" aria-label="Route overview" className="w-full aspect-[2/1] rounded-2xl bg-[#EEF2F6]">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#DDE3EA" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="400" height="200" fill="url(#grid)" />
      {r && <line x1={r.x} y1={r.y} x2={h.x} y2={h.y} stroke="#D92D47" strokeWidth="3" strokeDasharray="6 6" opacity="0.5" />}
      {r && (
        <g>
          <circle cx={r.x} cy={r.y} r="11" fill="#D92D47" />
          <text x={r.x} y={r.y + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">R</text>
        </g>
      )}
      <g>
        <circle cx={h.x} cy={h.y} r="11" fill="#1F2026" />
        <text x={h.x} y={h.y + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">H</text>
      </g>
      {d && (
        <g style={{ transition: "transform 1s linear" }}>
          <circle cx={d.x} cy={d.y} r="14" fill={riderStale ? "#9CA3AF" : "#24963F"} opacity="0.25" />
          <circle cx={d.x} cy={d.y} r="8" fill={riderStale ? "#9CA3AF" : "#24963F"} />
        </g>
      )}
    </svg>
  );
}
