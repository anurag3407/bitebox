"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, MapPinned, Pause, Play, Plus, RefreshCw, ScrollText, ServerCog } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const JOB_TONE: Record<string, string> = {
  PENDING: "badge-neutral",
  PROCESSING: "badge-warn",
  FAILED: "badge-danger",
};

function ZoneBatchesPanel({ zoneId }: { zoneId: string }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const batches = useQuery({ queryKey: ["zone-batches", zoneId], queryFn: () => api.getZoneBatches(zoneId) });
  const riders = useQuery({ queryKey: ["admin-riders"], queryFn: () => api.getAdminRiders() });
  const [locking, setLocking] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});

  const assign = async (batchId: string) => {
    setAssigning(batchId);
    try {
      const riderId = choices[batchId] ?? "";
      await api.assignBatchRider(zoneId, batchId, riderId || null);
      await queryClient.invalidateQueries({ queryKey: ["zone-batches", zoneId] });
      toast(riderId ? "Rider assigned to batch" : "Batch rider cleared", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setAssigning(null);
    }
  };

  const lock = async (slotWindow: string) => {
    setLocking(slotWindow);
    try {
      const start = new Date();
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const result = await api.lockZoneBatch(zoneId, {
        slotWindow,
        slotStart: start.toISOString(),
        slotEnd: end.toISOString(),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["zone-batches", zoneId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-zones"] }),
      ]);
      toast(`Batch locked · ${result.orders} orders across ${result.totalDrops} drops`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setLocking(null);
    }
  };

  if (batches.isPending) return <div className="mt-3 skeleton h-20" />;
  if (!batches.data) return <p className="mt-3 notice notice-danger">{errorMessage(batches.error)}</p>;
  const { candidates, batches: recent } = batches.data;

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {candidates.length === 0 ? (
        <p className="text-xs text-ink-muted">No paid drops are waiting for a batch in this zone.</p>
      ) : (
        candidates.map((candidate) => (
          <div key={candidate.slotWindow} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-subtle px-3 py-2 text-xs">
            <span className="text-ink">
              <b>{candidate.slotWindow}</b> · {candidate.orders} orders · {candidate.drops} drops
            </span>
            <button className="btn btn-primary btn-sm" disabled={locking !== null} onClick={() => lock(candidate.slotWindow)}>
              {locking === candidate.slotWindow && <RefreshCw className="h-3 w-3 animate-spin" />} Lock batch
            </button>
          </div>
        ))
      )}
      {recent.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">Recent batches</p>
          {recent.slice(0, 4).map((batch) => (
            <div key={batch.id} className="rounded-xl bg-subtle px-3 py-2 text-xs">
              <p className="text-ink-soft">
                {batch.slotWindow} · {batch.status.toLowerCase()} · {batch.orderCount} orders · {batch.totalDrops} drops ·{" "}
                {batch.riderName ?? "unassigned"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className="input h-8 min-w-[150px] flex-1 py-0 text-xs"
                  value={choices[batch.id] ?? batch.riderId ?? ""}
                  onChange={(e) => setChoices({ ...choices, [batch.id]: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {riders.data?.map((rider: any) => (
                    <option key={rider.id} value={rider.id}>{rider.name}{rider.isOnline ? " · online" : ""}</option>
                  ))}
                </select>
                <button className="btn btn-secondary btn-sm" disabled={assigning === batch.id} onClick={() => assign(batch.id)}>
                  {assigning === batch.id && <RefreshCw className="h-3 w-3 animate-spin" />} Assign
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminOperationsTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const operations = useQuery({
    queryKey: ["admin-operations"],
    queryFn: () => api.getAdminOperations(),
    refetchInterval: 15_000,
  });
  const zones = useQuery({ queryKey: ["admin-zones"], queryFn: () => api.getAdminZones() });
  const platformConfig = useQuery({
    queryKey: ["admin-platform-config"],
    queryFn: () => api.getAdminPlatformConfig(),
  });
  const [retrying, setRetrying] = useState<string | null>(null);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [zoneName, setZoneName] = useState("");
  const [cityId, setCityId] = useState("");
  const [centerLat, setCenterLat] = useState("28.6315");
  const [centerLng, setCenterLng] = useState("77.2167");
  const [radius, setRadius] = useState("3000");
  const [useCustomPolygon, setUseCustomPolygon] = useState(false);
  const [polygonJson, setPolygonJson] = useState("");
  const [zoneBusy, setZoneBusy] = useState<string | null>(null);
  const [dropFor, setDropFor] = useState<string | null>(null);
  const [batchesFor, setBatchesFor] = useState<string | null>(null);
  const [dropName, setDropName] = useState("");
  const [dropLat, setDropLat] = useState("");
  const [dropLng, setDropLng] = useState("");

  // Platform config local state
  const [platformFee, setPlatformFee] = useState<number>(5);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState<number>(199);
  const [baseDeliveryFee, setBaseDeliveryFee] = useState<number>(30);
  const [surgeMultiplierBps, setSurgeMultiplierBps] = useState<number>(10000);
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>("");
  const [savingConfig, setSavingConfig] = useState(false);

  React.useEffect(() => {
    if (platformConfig.data?.settings) {
      const s = platformConfig.data.settings;
      if (typeof s["pricing:platform_fee_paise"] === "number") setPlatformFee(Math.round(s["pricing:platform_fee_paise"] / 100));
      if (typeof s["pricing:free_delivery_threshold_paise"] === "number") setFreeDeliveryThreshold(Math.round(s["pricing:free_delivery_threshold_paise"] / 100));
      if (typeof s["pricing:base_delivery_fee_paise"] === "number") setBaseDeliveryFee(Math.round(s["pricing:base_delivery_fee_paise"] / 100));
      if (typeof s["pricing:surge_multiplier_bps"] === "number") setSurgeMultiplierBps(s["pricing:surge_multiplier_bps"]);
      if (typeof s["system:maintenance_mode"] === "boolean") setMaintenanceMode(s["system:maintenance_mode"]);
      if (s["system:announcement"]?.message) setAnnouncement(s["system:announcement"].message);
    }
  }, [platformConfig.data]);

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await api.updateAdminPlatformConfig({
        "pricing:platform_fee_paise": platformFee * 100,
        "pricing:free_delivery_threshold_paise": freeDeliveryThreshold * 100,
        "pricing:base_delivery_fee_paise": baseDeliveryFee * 100,
        "pricing:surge_multiplier_bps": surgeMultiplierBps,
        "system:maintenance_mode": maintenanceMode,
        "system:announcement": { enabled: Boolean(announcement.trim()), message: announcement.trim() },
      });
      await platformConfig.refetch();
      toast("Platform configuration saved", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingConfig(false);
    }
  };

  const refreshZones = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-zones"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-operations"] }),
    ]);
  };

  const createZone = async () => {
    setZoneBusy("create");
    try {
      let customPoints: Array<{ latitude: number; longitude: number }> | undefined;
      if (useCustomPolygon && polygonJson.trim()) {
        try {
          const parsed = JSON.parse(polygonJson.trim());
          if (Array.isArray(parsed) && parsed.length >= 3) {
            customPoints = parsed.map((p: any) => ({ latitude: Number(p.latitude ?? p.lat), longitude: Number(p.longitude ?? p.lng) }));
          }
        } catch {
          toast("Invalid polygon JSON. Expected array of objects with latitude and longitude", "error");
          setZoneBusy(null);
          return;
        }
      }

      await api.createAdminZone({
        name: zoneName.trim(),
        cityId: cityId || zones.data!.cities[0]!.id,
        centerLatitude: Number(centerLat),
        centerLongitude: Number(centerLng),
        radiusMeters: Number(radius),
        polygon: customPoints,
      });
      await refreshZones();
      setZoneOpen(false);
      setZoneName("");
      setPolygonJson("");
      toast("Zone created", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setZoneBusy(null);
    }
  };

  const toggleZone = async (zoneId: string, isActive: boolean) => {
    setZoneBusy(zoneId);
    try {
      await api.setAdminZoneActive(zoneId, isActive);
      await refreshZones();
      toast(isActive ? "Zone activated" : "Zone paused", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setZoneBusy(null);
    }
  };

  const createDropPoint = async (zoneId: string) => {
    setZoneBusy(zoneId);
    try {
      await api.createAdminDropPoint(zoneId, {
        name: dropName.trim(),
        latitude: Number(dropLat),
        longitude: Number(dropLng),
      });
      await refreshZones();
      setDropFor(null);
      setDropName("");
      setDropLat("");
      setDropLng("");
      toast("Drop point added", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setZoneBusy(null);
    }
  };

  if (operations.isPending) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-24" />
        <div className="skeleton h-64" />
      </div>
    );
  }
  if (!operations.data) return <p className="notice notice-danger">{errorMessage(operations.error)}</p>;
  const data = operations.data;
  const pending = data.stats.filter((s) => s.status === "PENDING").reduce((sum, s) => sum + s.count, 0);
  const processing = data.stats.filter((s) => s.status === "PROCESSING").reduce((sum, s) => sum + s.count, 0);
  const failed = data.stats.filter((s) => s.status === "FAILED").reduce((sum, s) => sum + s.count, 0);

  const retry = async (jobId: string) => {
    setRetrying(jobId);
    try {
      await api.retryAdminJob(jobId);
      await queryClient.invalidateQueries({ queryKey: ["admin-operations"] });
      toast("Job requeued with a fresh attempt budget", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="space-y-10">
      <section>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <ServerCog className="h-4 w-4" /> Queue health
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Worker backlog and failed jobs across all kinds.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Pending" value={String(pending)} sub="Waiting to run" />
          <Stat label="Processing" value={String(processing)} sub="Leased by a worker" />
          <Stat label="Failed" value={String(failed)} sub="Needs a retry" />
        </div>
      </section>

      {/* Editable Platform Config & Operational Policies */}
      <section className="rounded-3xl border border-line bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <ServerCog className="h-4 w-4" /> Platform policies &amp; pricing configuration
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Live marketplace switches, platform fees, free delivery rules, and emergency announcements.
            </p>
          </div>
          <button
            onClick={saveConfig}
            disabled={savingConfig}
            className="btn btn-primary btn-sm"
          >
            {savingConfig && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Save configuration
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-ink-muted">Platform fee (₹)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={platformFee}
              onChange={(e) => setPlatformFee(Number(e.target.value))}
              className="input input-sm mt-1 w-full"
            />
            <span className="text-[11px] text-ink-muted">Standard per-order fee</span>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-muted">Free delivery above (₹)</label>
            <input
              type="number"
              min={50}
              max={1000}
              value={freeDeliveryThreshold}
              onChange={(e) => setFreeDeliveryThreshold(Number(e.target.value))}
              className="input input-sm mt-1 w-full"
            />
            <span className="text-[11px] text-ink-muted">Subtotal for Gold free drops</span>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-muted">Base delivery fee (₹)</label>
            <input
              type="number"
              min={0}
              max={200}
              value={baseDeliveryFee}
              onChange={(e) => setBaseDeliveryFee(Number(e.target.value))}
              className="input input-sm mt-1 w-full"
            />
            <span className="text-[11px] text-ink-muted">Base customer delivery fare</span>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-muted">Surge multiplier (bps)</label>
            <input
              type="number"
              min={10000}
              max={30000}
              step={1000}
              value={surgeMultiplierBps}
              onChange={(e) => setSurgeMultiplierBps(Number(e.target.value))}
              className="input input-sm mt-1 w-full"
            />
            <span className="text-[11px] text-ink-muted">{(surgeMultiplierBps / 10000).toFixed(1)}x current surge</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-[auto_1fr] items-center">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(e) => setMaintenanceMode(e.target.checked)}
              className="h-4 w-4 rounded border-line"
            />
            <span className="text-sm font-medium text-ink">Maintenance mode</span>
          </label>
          <div>
            <label className="text-xs font-medium text-ink-muted">Global announcement banner</label>
            <input
              type="text"
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              placeholder="e.g. Heavy rain in Central Delhi — delivery may take 10-15 mins longer."
              className="input input-sm mt-1 w-full"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <AlertTriangle className="h-4 w-4" /> Failed jobs
        </h2>
        {data.failedJobs.length === 0 ? (
          <p className="notice notice-success mt-4">No failed jobs. Queue is healthy.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {data.failedJobs.map((job) => (
              <article key={job.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-white p-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{job.kind}</p>
                  <p className="mt-1 font-mono text-xs text-ink-muted">{job.id}</p>
                  {job.lastError && <p className="mt-2 max-w-2xl break-words text-sm text-danger">{job.lastError}</p>}
                  <p className="mt-1 text-xs text-ink-muted">
                    Attempts {job.attemptCount}/{job.maxAttempts} · updated {formatDateTime(job.updatedAt)}
                  </p>
                </div>
                <button className="btn btn-secondary btn-sm" disabled={retrying === job.id} onClick={() => retry(job.id)}>
                  <RefreshCw className={`h-3.5 w-3.5 ${retrying === job.id ? "animate-spin" : ""}`} />
                  {retrying === job.id ? "Requeueing…" : "Retry"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Activity className="h-4 w-4" /> Recent jobs
        </h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-subtle text-xs uppercase tracking-[0.08em] text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Attempts</th>
                <th className="px-4 py-3 font-medium">Run at</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.slice(0, 20).map((job) => (
                <tr key={job.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-ink">{job.kind}</td>
                  <td className="px-4 py-3"><span className={`badge ${JOB_TONE[job.status] ?? "badge-neutral"}`}>{job.status.toLowerCase()}</span></td>
                  <td className="px-4 py-3 tabular text-ink-muted">{job.attemptCount}/{job.maxAttempts}</td>
                  <td className="px-4 py-3 text-ink-muted">{formatDateTime(job.runAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <MapPinned className="h-4 w-4" /> Zones &amp; drop points
            </h2>
            <p className="mt-1 text-sm text-ink-muted">Operational clusters used for batching and corporate delivery.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setZoneOpen(!zoneOpen)}>
            <Plus className="h-3.5 w-3.5" /> Add zone
          </button>
        </div>

        {zoneOpen && (
          <div className="mt-4 rounded-2xl border border-line bg-white p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="label">Zone name</span><input className="input" value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="Indiranagar" /></label>
              <label>
                <span className="label">City</span>
                <select className="input" value={cityId || zones.data?.cities[0]?.id || ""} onChange={(e) => setCityId(e.target.value)}>
                  {zones.data?.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                </select>
              </label>
              <Field label="Center latitude"><input className="input" value={centerLat} onChange={(e) => setCenterLat(e.target.value)} /></Field>
              <Field label="Center longitude"><input className="input" value={centerLng} onChange={(e) => setCenterLng(e.target.value)} /></Field>
              {!useCustomPolygon && (
                <Field label="Radius (metres)"><input className="input" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value.replace(/\D/g, "").slice(0, 5))} /></Field>
              )}
            </div>

            <div className="mt-4 border-t border-line pt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomPolygon}
                  onChange={(e) => setUseCustomPolygon(e.target.checked)}
                  className="h-4 w-4 rounded border-line"
                />
                <span className="text-sm font-medium text-ink">Use custom polygon boundary (GeoJSON vertices)</span>
              </label>

              {useCustomPolygon && (
                <div className="mt-3">
                  <span className="label">Polygon vertices JSON (array of {"{ latitude, longitude }"})</span>
                  <textarea
                    rows={4}
                    value={polygonJson}
                    onChange={(e) => setPolygonJson(e.target.value)}
                    placeholder='[{"latitude": 28.6315, "longitude": 77.2167}, {"latitude": 28.6400, "longitude": 77.2250}, {"latitude": 28.6250, "longitude": 77.2300}]'
                    className="input font-mono text-xs"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">Enter at least 3 GPS coordinate vertices to define the custom zone polygon boundary.</p>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setZoneOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={zoneBusy === "create" || zoneName.trim().length < 2 || !Number(centerLat) || !Number(centerLng) || Number(radius) < 200}
                onClick={createZone}
              >
                {zoneBusy === "create" && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Create zone
              </button>
            </div>
          </div>
        )}

        {zones.isPending ? (
          <div className="mt-4 skeleton h-40" />
        ) : (zones.data?.zones.length ?? 0) === 0 ? (
          <p className="notice mt-4">No zones configured yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {zones.data!.zones.map((zone) => (
              <article key={zone.id} className="rounded-2xl border border-line bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">{zone.name}</p>
                  <span className={`badge ${zone.isActive ? "badge-success" : "badge-neutral"}`}>
                    {zone.isActive ? "active" : "paused"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {zone.dropPoints.length} drop {zone.dropPoints.length === 1 ? "point" : "points"} · {zone.batches} batches
                </p>
                {zone.dropPoints.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                    {zone.dropPoints.slice(0, 4).map((point) => <li key={point.id}>• {point.name}</li>)}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={zoneBusy === zone.id}
                    onClick={() => setDropFor(dropFor === zone.id ? null : zone.id)}
                  >
                    <Plus className="h-3 w-3" /> Drop point
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setBatchesFor(batchesFor === zone.id ? null : zone.id)}
                  >
                    Batches
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={zoneBusy === zone.id}
                    onClick={() => toggleZone(zone.id, !zone.isActive)}
                  >
                    {zone.isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {zone.isActive ? "Pause" : "Activate"}
                  </button>
                </div>
                {dropFor === zone.id && (
                  <div className="mt-3 space-y-2 border-t border-line pt-3">
                    <input className="input h-10" value={dropName} onChange={(e) => setDropName(e.target.value)} placeholder="Drop point name" />
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input h-10" value={dropLat} onChange={(e) => setDropLat(e.target.value)} placeholder="Latitude" />
                      <input className="input h-10" value={dropLng} onChange={(e) => setDropLng(e.target.value)} placeholder="Longitude" />
                    </div>
                    <button
                      className="btn btn-primary btn-sm btn-block"
                      disabled={zoneBusy === zone.id || dropName.trim().length < 2 || !Number(dropLat) || !Number(dropLng)}
                      onClick={() => createDropPoint(zone.id)}
                    >
                      Add drop point
                    </button>
                  </div>
                )}
                {batchesFor === zone.id && <ZoneBatchesPanel zoneId={zone.id} />}
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <ScrollText className="h-4 w-4" /> Audit trail
        </h2>
        {data.audits.length === 0 ? (
          <p className="notice mt-4">No privileged actions recorded yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {data.audits.map((entry, idx) => (
              <article key={`${entry.createdAt}-${idx}`} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{entry.action.replaceAll("_", " ").toLowerCase()}</p>
                  <p className="mt-0.5 font-mono text-xs text-ink-muted">{entry.targetType} · {entry.targetId}</p>
                </div>
                <p className="text-xs text-ink-muted">{entry.adminName} · {formatDateTime(entry.createdAt)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
