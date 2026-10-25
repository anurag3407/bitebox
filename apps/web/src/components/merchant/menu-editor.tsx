"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import type { EditableMenuItem } from "@startup/api-client";
import { Toggle } from "@/components/ui/field";
import { ActionDialog } from "@/components/ui/modal";
import { EmptyState, PageSpinner, SafeImage, VegMark } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";
import { ItemEditor } from "./item-editor";

type Pending =
  | { kind: "rename-category"; id: string; name: string }
  | { kind: "delete-category"; id: string; name: string }
  | { kind: "delete-item"; id: string; name: string };

/** Catalogue management. Kitchen staff only get stock toggles; editors get the full editor. */
export function MenuEditor({ restaurantId, canEdit }: { restaurantId: string; canEdit: boolean }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const menu = useQuery({ queryKey: ["editable-menu", restaurantId], queryFn: () => api.getEditableMenu(restaurantId) });
  const [editing, setEditing] = useState<{ item?: EditableMenuItem; categoryId: string } | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

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

  if (menu.isPending) return <PageSpinner />;
  if (!menu.data) return <p className="notice notice-danger">{errorMessage(menu.error)}</p>;

  return (
    <div className="max-w-4xl space-y-14">
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
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category, e.g. Desserts" aria-label="New category name" maxLength={60} className="input min-w-0 flex-1" />
          <button disabled={!newCategory.trim()} className="btn btn-primary h-12">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
      )}

      {menu.data.categories.length === 0 && (
        <EmptyState icon={<UtensilsCrossed />} title="Your menu is empty" body="Add a category, then your dishes. Customers can order once you resume accepting orders." />
      )}

      {menu.data.categories.map((cat) => (
        <section key={cat.id}>
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <h3 className={`flex items-center gap-2 text-base font-semibold ${cat.isActive ? "text-ink" : "text-ink-muted"}`}>
              {cat.name}
              <span className="text-sm font-normal text-ink-muted tabular">{cat.items.length}</span>
              {!cat.isActive && <span className="badge badge-neutral">Hidden</span>}
            </h3>
            {canEdit && (
              <div className="flex items-center">
                <button
                  aria-label={cat.isActive ? "Hide category" : "Show category"}
                  title={cat.isActive ? "Hide from customers" : "Show to customers"}
                  onClick={() => run(() => api.updateMenuCategory(restaurantId, cat.id, { isActive: !cat.isActive }))}
                  className="btn btn-ghost btn-icon h-9 w-9"
                >
                  {cat.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button aria-label="Rename category" onClick={() => setPending({ kind: "rename-category", id: cat.id, name: cat.name })} className="btn btn-ghost btn-icon h-9 w-9">
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  aria-label="Delete category"
                  title={cat.items.length ? "Move or delete its dishes first" : "Delete category"}
                  disabled={cat.items.length > 0}
                  onClick={() => setPending({ kind: "delete-category", id: cat.id, name: cat.name })}
                  className="btn btn-ghost btn-icon h-9 w-9"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button onClick={() => setEditing({ categoryId: cat.id })} className="btn btn-outline btn-sm ml-2">
                  <Plus className="h-3.5 w-3.5" /> Dish
                </button>
              </div>
            )}
          </div>
          <ul className={`rows ${!cat.isActive ? "opacity-60" : ""}`}>
            {cat.items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 py-4">
                <SafeImage src={item.imageUrl ?? undefined} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
                    <VegMark tag={item.dietaryTag} /> <span className="truncate">{item.name}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    <span className="tabular">{formatRupees(item.pricePaise)}</span>
                    {(item.variants?.length ?? 0) > 0 && ` · ${item.variants!.length} portions`}
                    {(item.modifierGroups?.length ?? 0) > 0 && ` · ${item.modifierGroups!.length} add-on groups`}
                  </p>
                </div>
                <span className={`hidden text-sm sm:inline ${item.isAvailable !== false ? "text-ink-muted" : "text-danger"}`}>{item.isAvailable !== false ? "In stock" : "Sold out"}</span>
                <Toggle
                  size="sm"
                  label={`${item.name} in stock`}
                  checked={item.isAvailable !== false}
                  onChange={(next) => run(() => api.merchantSetItemAvailability(restaurantId, item.id, next))}
                />
                {canEdit && (
                  <div className="flex">
                    <button aria-label={`Edit ${item.name}`} onClick={() => setEditing({ item, categoryId: cat.id })} className="btn btn-ghost btn-icon h-9 w-9">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button aria-label={`Delete ${item.name}`} onClick={() => setPending({ kind: "delete-item", id: item.id, name: item.name })} className="btn btn-ghost btn-icon h-9 w-9">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
            {cat.items.length === 0 && <li className="py-6 text-sm text-ink-muted">No dishes yet</li>}
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

      <ActionDialog
        open={pending?.kind === "rename-category"}
        onClose={() => setPending(null)}
        title="Rename category"
        confirmLabel="Save"
        input={{ label: "Category name", initialValue: pending?.name }}
        onConfirm={(name) => run(() => api.updateMenuCategory(restaurantId, pending!.id, { name }), "Category renamed")}
      />
      <ActionDialog
        open={pending?.kind === "delete-category"}
        onClose={() => setPending(null)}
        title={`Delete “${pending?.name}”?`}
        description="The category is removed from your menu."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => run(() => api.deleteMenuCategory(restaurantId, pending!.id), "Category deleted")}
      />
      <ActionDialog
        open={pending?.kind === "delete-item"}
        onClose={() => setPending(null)}
        title={`Remove “${pending?.name}”?`}
        description="Customers will no longer see this dish."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => run(() => api.deleteMenuItem(restaurantId, pending!.id), "Dish removed")}
      />
    </div>
  );
}
