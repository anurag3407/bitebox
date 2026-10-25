"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import type { AdminUser } from "@startup/api-client";
import { ActionDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const ROLE_LABEL: Record<AdminUser["role"], string> = {
  CUSTOMER: "Customer",
  MERCHANT_STAFF: "Restaurant staff",
  RIDER: "Rider",
  ADMIN: "Admin",
};

type Change = { user: AdminUser; update: { role?: AdminUser["role"]; isActive?: boolean } };

function describe({ user, update }: Change): string {
  if (update.role) return `Change ${user.name} from ${ROLE_LABEL[user.role]} to ${ROLE_LABEL[update.role]}?`;
  return update.isActive ? `Reactivate ${user.name}?` : `Suspend ${user.name}?`;
}

export function UsersTab() {
  const api = useApi();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pending, setPending] = useState<Change | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const users = useQuery({ queryKey: ["admin-users", debounced], queryFn: () => api.searchUsers(debounced) });

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" aria-label="Search users" className="input pl-11" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th className="py-3 pr-4 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Links</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="py-3 pl-4 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.data?.map((u) => (
              <tr key={u.id} className={u.isActive ? "" : "opacity-60"}>
                <td className="py-4 pr-4">
                  <p className="font-medium text-ink">
                    {u.name} {!u.isActive && <span className="badge badge-danger ml-1">Suspended</span>}
                  </p>
                  <p className="text-xs text-ink-muted">{u.email ?? u.phone ?? "—"}</p>
                </td>
                <td className="px-4 py-4">
                  <select
                    value={u.role}
                    onChange={(e) => setPending({ user: u, update: { role: e.target.value as AdminUser["role"] } })}
                    className="input input-sm w-auto"
                    aria-label={`Role for ${u.name}`}
                  >
                    {(Object.keys(ROLE_LABEL) as AdminUser["role"][]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-4 text-xs text-ink-muted">{[...u.restaurants, u.riderId ? "rider profile" : ""].filter(Boolean).join(", ") || "—"}</td>
                <td className="px-4 py-4 text-xs text-ink-muted">{formatDateTime(u.createdAt)}</td>
                <td className="py-4 pl-4 text-right">
                  <button onClick={() => setPending({ user: u, update: { isActive: !u.isActive } })} className={`btn btn-sm ${u.isActive ? "btn-danger-ghost" : "btn-outline"}`}>
                    {u.isActive ? "Suspend" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ActionDialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? describe(pending) : ""}
        confirmLabel="Confirm"
        tone={pending?.update.isActive === false ? "danger" : "default"}
        input={{ label: "Reason", placeholder: "Saved to the audit log", minLength: 3 }}
        onConfirm={async (reason) => {
          try {
            await api.updateUser(pending!.user.id, { ...pending!.update, reason });
            toast("User updated", "success");
            users.refetch();
          } catch (err) {
            toast(errorMessage(err), "error");
          }
        }}
      />
    </div>
  );
}
