"use client";

import React, { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { MenuItemDto, ModifierGroupDto, ModifierOptionDto } from "@startup/contracts";
import { MAX_LINE_QUANTITY } from "@/features/cart/cart-store";
import { Modal } from "@/components/ui/modal";
import { formatRupees } from "@/lib/format";

interface ItemCustomizerModalProps {
  item: MenuItemDto;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (customization: {
    variantId?: string;
    variantName?: string;
    basePricePaise: number;
    selectedOptions: ModifierOptionDto[];
    quantity: number;
    instructions?: string;
  }) => void;
}

function OptionRow({
  type,
  checked,
  disabled,
  onSelect,
  title,
  price,
}: {
  type: "radio" | "checkbox";
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  price: string;
}) {
  return (
    <button
      type="button"
      role={type}
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center gap-4 py-3.5 text-left disabled:opacity-40"
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center border transition-colors ${type === "radio" ? "rounded-full" : "rounded-md"} ${
          checked ? "border-ink bg-ink text-white" : "border-line-strong"
        }`}
      >
        {checked && (type === "radio" ? <span className="h-2 w-2 rounded-full bg-white" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />)}
      </span>
      <span className="flex-1 text-[15px] text-ink">{title}</span>
      <span className="text-sm text-ink-muted tabular">{price}</span>
    </button>
  );
}

export function ItemCustomizerModal({ item, isOpen, onClose, onConfirm }: ItemCustomizerModalProps) {
  // Default to the first portion that can actually be ordered
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(item.variants.find((v) => v.isAvailable)?.id);

  // Selected options map: groupId -> Set of option IDs
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<Record<string, Set<string>>>(() => {
    const initial: Record<string, Set<string>> = {};
    for (const group of item.modifierGroups) {
      initial[group.id] = new Set<string>();
      // Pre-select the first available option of single-choice required groups
      const firstAvailable = group.options.find((o) => o.isAvailable);
      if (group.isRequired && group.maxSelect === 1 && firstAvailable) initial[group.id]!.add(firstAvailable.id);
    }
    return initial;
  });
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState("");

  const currentVariant = item.variants.find((v) => v.id === selectedVariantId);
  const basePricePaise = currentVariant ? currentVariant.pricePaise : item.pricePaise;

  let optionsPricePaise = 0;
  const allSelectedOptions: ModifierOptionDto[] = [];
  for (const group of item.modifierGroups) {
    const set = selectedOptionsMap[group.id];
    for (const opt of group.options) {
      if (set?.has(opt.id)) {
        optionsPricePaise += opt.pricePaise;
        allSelectedOptions.push(opt);
      }
    }
  }
  const grandTotalPaise = (basePricePaise + optionsPricePaise) * quantity;

  // Same rules as the server: required groups need their minimum, optional groups
  // enforce their minimum once started
  let validationMessage = "";
  if (item.variants.length > 0 && !currentVariant) validationMessage = "Choose a portion size";
  for (const group of item.modifierGroups) {
    if (validationMessage) break;
    const count = selectedOptionsMap[group.id]?.size || 0;
    const min = group.isRequired ? Math.max(1, group.minSelect) : group.minSelect;
    if ((group.isRequired || count > 0) && count < min) validationMessage = `Choose ${min} in “${group.name}”`;
  }
  const canConfirm = !validationMessage;

  const toggleOption = (group: ModifierGroupDto, option: ModifierOptionDto) => {
    const currentSet = new Set(selectedOptionsMap[group.id] || []);
    if (group.maxSelect === 1) {
      currentSet.clear();
      currentSet.add(option.id);
    } else if (currentSet.has(option.id)) {
      currentSet.delete(option.id);
    } else if (currentSet.size < group.maxSelect) {
      currentSet.add(option.id);
    }
    setSelectedOptionsMap({ ...selectedOptionsMap, [group.id]: currentSet });
  };

  const handleAdd = () => {
    if (!canConfirm) return;
    onConfirm({
      variantId: currentVariant?.id,
      variantName: currentVariant?.name,
      basePricePaise,
      selectedOptions: allSelectedOptions,
      quantity,
      instructions: instructions.trim() || undefined,
    });
    onClose();
  };

  const groupHeader = (title: string, sub: string, required: boolean) => (
    <div className="flex items-baseline justify-between gap-3 pb-1">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <p className="text-xs text-ink-muted">{sub}</p>
      </div>
      {required && <span className="badge badge-neutral">Required</span>}
    </div>
  );

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={item.name}
      description={item.description ?? undefined}
      footer={
        <div className="flex items-center gap-3">
          <div className="stepper h-14 px-1">
            <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))} className="!w-11">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center tabular" aria-live="polite">
              {quantity}
            </span>
            <button type="button" aria-label="Increase quantity" disabled={quantity >= MAX_LINE_QUANTITY} onClick={() => setQuantity(Math.min(MAX_LINE_QUANTITY, quantity + 1))} className="!w-11">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button onClick={handleAdd} disabled={!canConfirm} className="btn btn-primary btn-lg flex-1 justify-between !opacity-100 disabled:bg-subtle disabled:text-ink-muted">
            <span>{canConfirm ? "Add to cart" : validationMessage}</span>
            {canConfirm && <span className="tabular">{formatRupees(grandTotalPaise)}</span>}
          </button>
        </div>
      }
    >
      <div className="space-y-8 pb-2">
        {(item.serves || item.nutrition?.calories || item.spiceLevel || item.allergens.length > 0) && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {item.serves && <span className="badge badge-neutral">Serves {item.serves}</span>}
              {item.nutrition?.calories && <span className="badge badge-neutral">{item.nutrition.calories} kcal</span>}
              {item.spiceLevel ? (
                <span className="badge badge-warn">{["", "Mild", "Spicy", "Extra spicy"][item.spiceLevel]}</span>
              ) : null}
              {item.allergens.map((a) => (
                <span key={a} className="badge badge-danger">
                  Contains {a.toLowerCase()}
                </span>
              ))}
            </div>
            {item.nutrition && (item.nutrition.proteinG || item.nutrition.carbsG || item.nutrition.fatG) && (
              <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-subtle p-3 text-center">
                {[
                  ["Protein", item.nutrition.proteinG],
                  ["Carbs", item.nutrition.carbsG],
                  ["Fat", item.nutrition.fatG],
                ].map(([label, value]) =>
                  value !== undefined ? (
                    <div key={String(label)}>
                      <dt className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</dt>
                      <dd className="mt-0.5 text-sm font-medium text-ink tabular">{value} g</dd>
                    </div>
                  ) : null
                )}
              </dl>
            )}
          </div>
        )}
        {item.variants.length > 0 && (
          <section>
            {groupHeader("Portion", "Choose one", true)}
            <div className="rows">
              {item.variants.map((v) => (
                <OptionRow
                  key={v.id}
                  type="radio"
                  checked={selectedVariantId === v.id}
                  disabled={!v.isAvailable}
                  onSelect={() => setSelectedVariantId(v.id)}
                  title={`${v.name}${v.isAvailable ? "" : " · sold out"}`}
                  price={formatRupees(v.pricePaise)}
                />
              ))}
            </div>
          </section>
        )}

        {item.modifierGroups.map((group) => {
          const currentSelected = selectedOptionsMap[group.id] || new Set();
          return (
            <section key={group.id}>
              {groupHeader(group.name, group.maxSelect === 1 ? "Choose one" : `Choose up to ${group.maxSelect}`, group.isRequired)}
              <div className="rows">
                {group.options.map((option) => (
                  <OptionRow
                    key={option.id}
                    type={group.maxSelect === 1 ? "radio" : "checkbox"}
                    checked={currentSelected.has(option.id)}
                    disabled={!option.isAvailable}
                    onSelect={() => toggleOption(group, option)}
                    title={option.name}
                    price={option.pricePaise === 0 ? "Free" : `+${formatRupees(option.pricePaise)}`}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <label className="block">
          <span className="label">Cooking instructions</span>
          <input
            type="text"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Less spicy, no onions…"
            maxLength={150}
            className="input"
          />
        </label>
      </div>
    </Modal>
  );
}
