"use client";

import React, { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { EditableMenu, EditableMenuItem } from "@startup/api-client";
import type { MenuItemInputRaw } from "@startup/contracts";
import { Field, MoneyInput, Toggle } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SafeImage, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";

type Draft = MenuItemInputRaw & { id?: string };

function blank(categoryId: string): Draft {
  return { categoryId, name: "", description: "", pricePaise: 0, dietaryTag: "VEG", imageUrl: "", isBestseller: false, isAvailable: true, displayOrder: 0, variants: [], modifierGroups: [] };
}

function SubHeading({ title, hint, action }: { title: string; hint?: string; action: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
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
  // Functional update: async callers (image upload) must not overwrite edits made meanwhile
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const variants = d.variants ?? [];
  const groups = d.modifierGroups ?? [];
  const canSave = d.name.trim().length > 0 && d.pricePaise > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={item ? `Edit ${item.name}` : "New dish"}
      footer={
        <button
          disabled={busy || !canSave}
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
          className="btn btn-primary btn-lg btn-block"
        >
          {busy && <Spinner />} Save dish
        </button>
      }
    >
      <div className="space-y-10 pb-2">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name">
            <input value={d.name} maxLength={80} onChange={(e) => set("name", e.target.value)} className="input" />
          </Field>
          <Field label="Price">
            <MoneyInput paise={d.pricePaise} onChange={(p) => set("pricePaise", p)} ariaLabel="Price" />
          </Field>
          <Field label="Category">
            <select value={d.categoryId} onChange={(e) => set("categoryId", e.target.value)} className="input">
              {menu.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select value={d.dietaryTag} onChange={(e) => set("dietaryTag", e.target.value as Draft["dietaryTag"])} className="input">
              <option value="VEG">Veg</option>
              <option value="NON_VEG">Non-veg</option>
              <option value="EGG">Contains egg</option>
              <option value="VEGAN">Vegan</option>
            </select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea rows={2} maxLength={400} value={d.description ?? ""} onChange={(e) => set("description", e.target.value)} className="input" />
          </Field>
          <div className="flex items-end gap-4 sm:col-span-2">
            <SafeImage src={d.imageUrl || undefined} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
            <Field label="Photo URL" className="min-w-0 flex-1">
              <input value={d.imageUrl ?? ""} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" className="input" />
            </Field>
            <label className={`btn btn-outline h-12 cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? <Spinner /> : <Upload className="h-4 w-4" />} Upload
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setUploading(true);
                  try {
                    const { url } = await api.uploadMenuImage(restaurantId, file);
                    set("imageUrl", url);
                  } catch (err) {
                    toast(errorMessage(err), "error");
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-subtle px-4 py-3">
            <span className="text-sm text-ink">Bestseller</span>
            <Toggle size="sm" label="Bestseller" checked={!!d.isBestseller} onChange={(v) => set("isBestseller", v)} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-subtle px-4 py-3">
            <span className="text-sm text-ink">In stock</span>
            <Toggle size="sm" label="In stock" checked={d.isAvailable !== false} onChange={(v) => set("isAvailable", v)} />
          </div>
        </div>

        <section className="space-y-4">
          <SubHeading
            title="Portions"
            hint="Customers pick one; its price replaces the base price."
            action={
              <button onClick={() => set("variants", [...variants, { name: "", pricePaise: d.pricePaise, isAvailable: true }])} className="btn btn-ghost btn-sm -mr-4">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            }
          />
          {variants.map((v, i) => (
            <div key={v.id ?? `new-${i}`} className="flex items-center gap-2">
              <input
                placeholder="e.g. Half"
                aria-label="Portion name"
                value={v.name}
                onChange={(e) => set("variants", variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                className="input min-w-0 flex-1"
              />
              <div className="w-32">
                <MoneyInput ariaLabel="Portion price" paise={v.pricePaise} onChange={(p) => set("variants", variants.map((x, j) => (j === i ? { ...x, pricePaise: p } : x)))} />
              </div>
              <button aria-label="Remove portion" onClick={() => set("variants", variants.filter((_, j) => j !== i))} className="btn btn-ghost btn-icon">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <SubHeading
            title="Add-on groups"
            hint="Extras like dips, toppings or sides."
            action={
              <button
                onClick={() => set("modifierGroups", [...groups, { name: "", minSelect: 0, maxSelect: 1, isRequired: false, options: [{ name: "", pricePaise: 0, isAvailable: true }] }])}
                className="btn btn-ghost btn-sm -mr-4"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            }
          />
          {groups.map((g, gi) => {
            const updateGroup = (patch: Partial<typeof g>) => set("modifierGroups", groups.map((x, j) => (j === gi ? { ...x, ...patch } : x)));
            return (
              <div key={g.id ?? `new-${gi}`} className="panel space-y-4 p-5">
                <div className="flex items-center gap-2">
                  <input placeholder="Group name, e.g. Choose a dip" aria-label="Group name" value={g.name} onChange={(e) => updateGroup({ name: e.target.value })} className="input min-w-0 flex-1 bg-white" />
                  <button aria-label="Remove group" onClick={() => set("modifierGroups", groups.filter((_, j) => j !== gi))} className="btn btn-ghost btn-icon">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-soft">
                  <label className="flex items-center gap-2">
                    <Toggle
                      size="sm"
                      label="Required"
                      checked={g.isRequired}
                      onChange={(v) => updateGroup({ isRequired: v, minSelect: v ? Math.max(1, g.minSelect) : g.minSelect })}
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-2">
                    Min
                    <input type="number" min={0} value={g.minSelect} onChange={(e) => updateGroup({ minSelect: Number(e.target.value) })} className="input input-sm w-16 bg-white" />
                  </label>
                  <label className="flex items-center gap-2">
                    Max
                    <input type="number" min={1} value={g.maxSelect} onChange={(e) => updateGroup({ maxSelect: Number(e.target.value) })} className="input input-sm w-16 bg-white" />
                  </label>
                </div>
                <div className="space-y-2">
                  {g.options.map((o, oi) => (
                    <div key={o.id ?? `new-${oi}`} className="flex items-center gap-2">
                      <input
                        placeholder="Option"
                        aria-label="Option name"
                        value={o.name}
                        onChange={(e) => updateGroup({ options: g.options.map((x, j) => (j === oi ? { ...x, name: e.target.value } : x)) })}
                        className="input input-sm min-w-0 flex-1 bg-white"
                      />
                      <div className="w-28">
                        <MoneyInput
                          ariaLabel="Option price"
                          className="input input-sm bg-white"
                          paise={o.pricePaise}
                          onChange={(p) => updateGroup({ options: g.options.map((x, j) => (j === oi ? { ...x, pricePaise: p } : x)) })}
                        />
                      </div>
                      <button aria-label="Remove option" onClick={() => updateGroup({ options: g.options.filter((_, j) => j !== oi) })} className="btn btn-ghost btn-icon h-9 w-9">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => updateGroup({ options: [...g.options, { name: "", pricePaise: 0, isAvailable: true }] })} className="btn btn-ghost btn-sm -ml-4">
                  <Plus className="h-3.5 w-3.5" /> Option
                </button>
              </div>
            );
          })}
        </section>
      </div>
    </Modal>
  );
}
