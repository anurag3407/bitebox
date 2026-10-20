"use client";

import React, { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { EditableMenu, EditableMenuItem } from "@startup/api-client";
import type { MenuItemInputRaw } from "@startup/contracts";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";

const rupeesToPaise = (v: string) => Math.round(Number(v || 0) * 100);
const paiseToRupees = (p: number) => String(p / 100);
const field = "w-full p-2.5 rounded-xl border border-border text-sm";

type Draft = MenuItemInputRaw & { id?: string };

function blank(categoryId: string): Draft {
  return { categoryId, name: "", description: "", pricePaise: 0, dietaryTag: "VEG", imageUrl: "", isBestseller: false, isAvailable: true, displayOrder: 0, variants: [], modifierGroups: [] };
}

/** Create/edit a dish including portions and add-on groups. */
export function ItemEditor({
  restaurantId,
  menu,
  item,
  categoryId,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  menu: EditableMenu;
  item?: EditableMenuItem;
  categoryId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => (item ? structuredClone(item) : blank(categoryId)));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const variants = d.variants ?? [];
  const groups = d.modifierGroups ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={item ? `Edit ${item.name}` : "New dish"}
      footer={
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.saveMenuItem(restaurantId, { ...d, imageUrl: d.imageUrl || undefined, description: d.description || undefined });
              toast("Dish saved", "success");
              onSaved();
              onClose();
            } catch (err) {
              toast(errorMessage(err), "error");
            } finally {
              setBusy(false);
            }
          }}
          className="w-full py-3 rounded-xl bg-brand text-white font-bold flex items-center justify-center gap-2"
        >
          {busy && <Spinner />} Save dish
        </button>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-text-secondary">
            Name *
            <input value={d.name} maxLength={80} onChange={(e) => set("name", e.target.value)} className={field} />
          </label>
          <label className="text-xs font-semibold text-text-secondary">
            Price (₹) *
            <input inputMode="decimal" value={d.pricePaise ? paiseToRupees(d.pricePaise) : ""} onChange={(e) => set("pricePaise", rupeesToPaise(e.target.value))} className={field} />
          </label>
          <label className="text-xs font-semibold text-text-secondary">
            Category
            <select value={d.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={field}>
              {menu.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-text-secondary">
            Type
            <select value={d.dietaryTag} onChange={(e) => set("dietaryTag", e.target.value as Draft["dietaryTag"])} className={field}>
              <option value="VEG">Veg</option>
              <option value="NON_VEG">Non-veg</option>
              <option value="EGG">Contains egg</option>
              <option value="VEGAN">Vegan</option>
            </select>
          </label>
        </div>
        <label className="block text-xs font-semibold text-text-secondary">
          Description
          <textarea rows={2} maxLength={400} value={d.description ?? ""} onChange={(e) => set("description", e.target.value)} className={field} />
        </label>
        <div className="flex gap-2 items-end">
          <label className="flex-1 text-xs font-semibold text-text-secondary">
            Photo URL
            <input value={d.imageUrl ?? ""} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" className={field} />
          </label>
          <label className="px-3 py-2.5 rounded-xl border border-border text-xs font-bold flex items-center gap-1 cursor-pointer">
            {uploading ? <Spinner /> : <Upload className="w-4 h-4" />} Upload
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  set("imageUrl", (await api.uploadMenuImage(restaurantId, file)).url);
                } catch (err) {
                  toast(errorMessage(err), "error");
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={!!d.isBestseller} onChange={(e) => set("isBestseller", e.target.checked)} /> Bestseller
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={d.isAvailable !== false} onChange={(e) => set("isAvailable", e.target.checked)} /> In stock
          </label>
        </div>

        <section>
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Portions</h3>
            <button onClick={() => set("variants", [...variants, { name: "", pricePaise: d.pricePaise, isAvailable: true }])} className="text-xs font-bold text-brand flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add portion
            </button>
          </div>
          <p className="text-[11px] text-text-secondary">With portions, customers must choose one and its price replaces the base price.</p>
          {variants.map((v, i) => (
            <div key={v.id ?? i} className="flex gap-2 mt-2">
              <input placeholder="e.g. Half" value={v.name} onChange={(e) => set("variants", variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={field} />
              <input inputMode="decimal" placeholder="₹" value={paiseToRupees(v.pricePaise)} onChange={(e) => set("variants", variants.map((x, j) => (j === i ? { ...x, pricePaise: rupeesToPaise(e.target.value) } : x)))} className={`${field} w-28`} />
              <button aria-label="Remove portion" onClick={() => set("variants", variants.filter((_, j) => j !== i))} className="p-2 text-text-secondary">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Add-on groups</h3>
            <button
              onClick={() => set("modifierGroups", [...groups, { name: "", minSelect: 0, maxSelect: 1, isRequired: false, options: [{ name: "", pricePaise: 0, isAvailable: true }] }])}
              className="text-xs font-bold text-brand flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add group
            </button>
          </div>
          {groups.map((g, gi) => {
            const updateGroup = (patch: Partial<typeof g>) => set("modifierGroups", groups.map((x, j) => (j === gi ? { ...x, ...patch } : x)));
            return (
              <div key={g.id ?? gi} className="mt-3 p-3 rounded-xl bg-surface-muted space-y-2">
                <div className="flex gap-2 items-center">
                  <input placeholder="Group name, e.g. Choose a dip" value={g.name} onChange={(e) => updateGroup({ name: e.target.value })} className={field} />
                  <button aria-label="Remove group" onClick={() => set("modifierGroups", groups.filter((_, j) => j !== gi))} className="p-2 text-text-secondary">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-3 text-xs items-center flex-wrap">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={g.isRequired} onChange={(e) => updateGroup({ isRequired: e.target.checked, minSelect: e.target.checked ? Math.max(1, g.minSelect) : g.minSelect })} /> Required
                  </label>
                  <label>
                    Min <input type="number" min={0} value={g.minSelect} onChange={(e) => updateGroup({ minSelect: Number(e.target.value) })} className="w-14 p-1 rounded border border-border" />
                  </label>
                  <label>
                    Max <input type="number" min={1} value={g.maxSelect} onChange={(e) => updateGroup({ maxSelect: Number(e.target.value) })} className="w-14 p-1 rounded border border-border" />
                  </label>
                </div>
                {g.options.map((o, oi) => (
                  <div key={o.id ?? oi} className="flex gap-2">
                    <input placeholder="Option" value={o.name} onChange={(e) => updateGroup({ options: g.options.map((x, j) => (j === oi ? { ...x, name: e.target.value } : x)) })} className={field} />
                    <input inputMode="decimal" placeholder="+₹" value={paiseToRupees(o.pricePaise)} onChange={(e) => updateGroup({ options: g.options.map((x, j) => (j === oi ? { ...x, pricePaise: rupeesToPaise(e.target.value) } : x)) })} className={`${field} w-24`} />
                    <button aria-label="Remove option" onClick={() => updateGroup({ options: g.options.filter((_, j) => j !== oi) })} className="p-2 text-text-secondary">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button onClick={() => updateGroup({ options: [...g.options, { name: "", pricePaise: 0, isAvailable: true }] })} className="text-xs font-bold text-brand">
                  + Option
                </button>
              </div>
            );
          })}
        </section>
      </div>
    </Modal>
  );
}
