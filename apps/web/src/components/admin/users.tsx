"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminUser } from "@startup/api-client";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export function UsersTab() {
  const api = useApi();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const users = useQuery({ queryKey: ["admin-users", debounced], queryFn: () => api.searchUsers(debounced) });

  const change = async (u: AdminUser, update: { role?: AdminUser["role"]; isActive?: boolean }) => {
    const reason = prompt("Reason (saved to the audit log)")?.trim();
    if (!reason || reason.length < 3) return;
    try {
      await api.updateUser(u.id, { ...update, reason });
      toast("User updated", "success");
      users.refetch();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" className="w-full p-2.5 rounded-xl border border-border text-sm" />
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs text-text-secondary text-left">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Role</th>
              <th className="p-3">Links</th>
              <th className="p-3">Joined</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.data?.map((u) => (
              <tr key={u.id}>
                <td className="p-3">
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-xs text-text-secondary">{u.email ?? u.phone ?? "—"}</p>
                </td>
                <td className="p-3">
                  <select value={u.role} onChange={(e) => change(u, { role: e.target.value as AdminUser["role"] })} className="p-1.5 rounded-lg border border-border text-xs">
                    <option value="CUSTOMER">Customer</option>
                    <option value="MERCHANT_STAFF">Restaurant staff</option>
                    <option value="RIDER">Rider</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td className="p-3 text-xs text-text-secondary">{[...u.restaurants, u.riderId ? "rider profile" : ""].filter(Boolean).join(", ") || "—"}</td>
                <td className="p-3 text-xs text-text-secondary">{formatDateTime(u.createdAt)}</td>
                <td className="p-3">
                  <button onClick={() => change(u, { isActive: !u.isActive })} className={`text-xs font-bold ${u.isActive ? "text-red-700" : "text-success"}`}>
                    {u.isActive ? "Suspend" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
