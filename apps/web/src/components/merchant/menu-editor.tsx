"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import type { EditableMenuItem } from "@startup/api-client";
import { SafeImage, Spinner, VegMark } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";
import { ItemEditor } from "./item-editor";

/** Catalogue management. Kitchen staff only get stock toggles; editors get the full editor. */
export function MenuEditor({ restaurantId, canEdit }: { restaurantId: string; canEdit: boolean }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const menu = useQuery({ queryKey: ["editable-menu", restaurantId], queryFn: () => api.getEditableMenu(restaurantId) });
  const [editing, setEditing] = useState<{ item?: EditableMenuItem; categoryId: string } | null>(null);
  const [newCategory, setNewCategory] = useState("");

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      queryClient.invalidateQueries({ queryKey: ["editable-menu", restaurantId] });
    }
  };

  if (menu.isPending) return <Spinner />;
  if (!menu.data) return <p className="text-sm text-red-700">{errorMessage(menu.error)}</p>;

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newCategory.trim()) return;
            run(() => api.createMenuCategory(restaurantId, newCategory.trim()), "Category added");
            setNewCategory("");
          }}
          className="flex gap-2"
        >
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category, e.g. Desserts" maxLength={60} className="flex-1 p-2.5 rounded-xl border border-border text-sm" />
          <button className="px-4 py-2.5 rounded-xl bg-text-primary text-white text-sm font-bold">Add category</button>
        </form>
      )}

      {menu.data.categories.length === 0 && <p className="text-sm text-text-secondary">Add a category, then your dishes. Customers can order once you resume accepting orders.</p>}

      {menu.data.categories.map((cat) => (
        <section key={cat.id} className={!cat.isActive ? "opacity-60" : ""}>
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="font-bold">
              {cat.name} <span className="text-text-secondary font-normal text-xs">({cat.items.length})</span>
            </h3>
            {canEdit && (
              <div className="flex items-center gap-1">
                <button aria-label={cat.isActive ? "Hide category" : "Show category"} onClick={() => run(() => api.updateMenuCategory(restaurantId, cat.id, { isActive: !cat.isActive }))} className="p-2 text-text-secondary">
                  {cat.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  aria-label="Rename category"
                  onClick={() => {
                    const name = prompt("Category name", cat.name)?.trim();
                    if (name) run(() => api.updateMenuCategory(restaurantId, cat.id, { name }));
                  }}
                  className="p-2 text-text-secondary"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button aria-label="Delete category" onClick={() => run(() => api.deleteMenuCategory(restaurantId, cat.id), "Category deleted")} className="p-2 text-text-secondary">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing({ categoryId: cat.id })} className="ml-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-bold flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Dish
                </button>
              </div>
            )}
          </div>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-white">
            {cat.items.map((item) => (
              <li key={item.id} className="p-3 flex items-center gap-3">
                <SafeImage src={item.imageUrl ?? undefined} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <VegMark tag={item.dietaryTag} /> <span className="truncate">{item.name}</span>
                  </p>
                  <p className="text-xs text-text-secondary">
                    {formatRupees(item.pricePaise)}
                    {(item.variants?.length ?? 0) > 0 && ` · ${item.variants!.length} portions`}
                    {(item.modifierGroups?.length ?? 0) > 0 && ` · ${item.modifierGroups!.length} add-on groups`}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer">
                  {item.isAvailable ? "In stock" : "Sold out"}
                  <input
                    type="checkbox"
                    role="switch"
                    checked={item.isAvailable !== false}
                    onChange={(e) => run(() => api.merchantSetItemAvailability(restaurantId, item.id, e.target.checked))}
                    className="w-5 h-5 accent-[#24963F]"
                  />
                </label>
                {canEdit && (
                  <>
                    <button aria-label={`Edit ${item.name}`} onClick={() => setEditing({ item, categoryId: cat.id })} className="p-2 text-text-secondary">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      aria-label={`Delete ${item.name}`}
                      onClick={() => confirm(`Remove "${item.name}" from the menu?`) && run(() => api.deleteMenuItem(restaurantId, item.id), "Dish removed")}
                      className="p-2 text-text-secondary"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
            {cat.items.length === 0 && <li className="p-3 text-xs text-text-secondary">No dishes yet</li>}
          </ul>
        </section>
      ))}

      {editing && (
        <ItemEditor
          restaurantId={restaurantId}
          menu={menu.data}
          item={editing.item}
          categoryId={editing.categoryId}
          onClose={() => setEditing(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["editable-menu", restaurantId] })}
        />
      )}
    </div>
  );
}
