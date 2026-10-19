"use client";

import React, { useState } from "react";
import { X, Check } from "lucide-react";
import { MenuItemDto, ModifierGroupDto, ModifierOptionDto } from "@startup/contracts";

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

export function ItemCustomizerModal({
  item,
  isOpen,
  onClose,
  onConfirm,
}: ItemCustomizerModalProps) {
  // Selected variant (default to first variant if any exist)
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    item.variants[0]?.id
  );

  // Selected options map: groupId -> Set of option IDs
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<Record<string, Set<string>>>(() => {
    const initial: Record<string, Set<string>> = {};
    for (const group of item.modifierGroups) {
      initial[group.id] = new Set<string>();
      // Auto-select first option if required and minSelect === 1
      if (group.isRequired && group.minSelect === 1 && group.options[0]) {
        initial[group.id]!.add(group.options[0].id);
      }
    }
    return initial;
  });

  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState("");

  if (!isOpen) return null;

  const currentVariant = item.variants.find((v) => v.id === selectedVariantId);
  const basePricePaise = currentVariant ? currentVariant.pricePaise : item.pricePaise;

  // Calculate selected options price
  let optionsPricePaise = 0;
  const allSelectedOptions: ModifierOptionDto[] = [];

  for (const group of item.modifierGroups) {
    const set = selectedOptionsMap[group.id];
    if (set) {
      for (const opt of group.options) {
        if (set.has(opt.id)) {
          optionsPricePaise += opt.pricePaise;
          allSelectedOptions.push(opt);
        }
      }
    }
  }

  const unitTotalPaise = basePricePaise + optionsPricePaise;
  const grandTotalPaise = unitTotalPaise * quantity;

  // Check required group constraints
  let canConfirm = true;
  let validationMessage = "";

  for (const group of item.modifierGroups) {
    const count = selectedOptionsMap[group.id]?.size || 0;
    if (group.isRequired && count < group.minSelect) {
      canConfirm = false;
      validationMessage = `Please select at least ${group.minSelect} option in "${group.name}"`;
      break;
    }
  }

  const toggleOption = (group: ModifierGroupDto, option: ModifierOptionDto) => {
    const currentSet = new Set(selectedOptionsMap[group.id] || []);

    if (group.maxSelect === 1) {
      // Single select (radio style)
      currentSet.clear();
      currentSet.add(option.id);
    } else {
      // Multi-select (checkbox style)
      if (currentSet.has(option.id)) {
        currentSet.delete(option.id);
      } else {
        if (currentSet.size < group.maxSelect) {
          currentSet.add(option.id);
        }
      }
    }

    setSelectedOptionsMap({
      ...selectedOptionsMap,
      [group.id]: currentSet,
    });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-text-primary tracking-tight">
              Customize &quot;{item.name}&quot;
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Select portion size and your favorite add-ons
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-muted text-text-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Options List */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {/* 1. Portion / Variant Selection */}
          {item.variants.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-sm font-bold text-text-primary">Portion Size</h4>
                <span className="text-[11px] font-bold text-brand uppercase tracking-wider">
                  Required
                </span>
              </div>
              <div className="space-y-2">
                {item.variants.map((v) => (
                  <label
                    key={v.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedVariantId === v.id
                        ? "border-brand bg-brand-light/40"
                        : "border-border hover:bg-surface-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="variant"
                        checked={selectedVariantId === v.id}
                        onChange={() => setSelectedVariantId(v.id)}
                        className="text-brand focus:ring-brand"
                      />
                      <span className="text-xs font-semibold text-text-primary">{v.name}</span>
                    </div>
                    <span className="text-xs font-bold text-text-primary">
                      ₹{v.pricePaise / 100}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 2. Modifier Groups */}
          {item.modifierGroups.map((group) => {
            const currentSelected = selectedOptionsMap[group.id] || new Set();

            return (
              <div key={group.id} className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">{group.name}</h4>
                    <p className="text-[11px] text-text-secondary">
                      {group.maxSelect === 1
                        ? "Select 1 option"
                        : `Select up to ${group.maxSelect} options`}
                    </p>
                  </div>
                  {group.isRequired && (
                    <span className="text-[10px] font-bold text-brand uppercase bg-brand-light px-2 py-0.5 rounded-full">
                      Required
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {group.options.map((option) => {
                    const isChecked = currentSelected.has(option.id);
                    return (
                      <label
                        key={option.id}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          isChecked
                            ? "border-brand bg-brand-light/30"
                            : "border-border hover:bg-surface-muted"
                        } ${!option.isAvailable ? "opacity-50 pointer-events-none" : ""}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type={group.maxSelect === 1 ? "radio" : "checkbox"}
                            name={group.id}
                            checked={isChecked}
                            onChange={() => toggleOption(group, option)}
                            className="text-brand focus:ring-brand rounded-sm"
                          />
                          <span className="text-xs font-medium text-text-primary">
                            {option.name}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-text-secondary">
                          {option.pricePaise === 0 ? "Free" : `+₹${option.pricePaise / 100}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* 3. Cooking Instructions */}
          <div>
            <h4 className="text-sm font-bold text-text-primary mb-1.5">
              Special Instructions
            </h4>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Less spicy, extra onions, no cutlery..."
              maxLength={150}
              className="w-full p-3 bg-surface-muted border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
        </div>

        {/* Footer with Total and Add button */}
        <div className="p-4 border-t border-border bg-surface-muted/50 flex items-center justify-between gap-4">
          {/* Quantity Stepper */}
          <div className="flex items-center border border-border bg-white rounded-xl shadow-xs">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="px-3 py-2 text-text-secondary hover:text-brand font-bold text-sm"
            >
              −
            </button>
            <span className="px-2 text-xs font-black text-text-primary">{quantity}</span>
            <button
              onClick={() => setQuantity(Math.min(10, quantity + 1))}
              className="px-3 py-2 text-text-secondary hover:text-brand font-bold text-sm"
            >
              +
            </button>
          </div>

          {/* Confirm Button */}
          <button
            onClick={handleAdd}
            disabled={!canConfirm}
            className={`flex-1 py-3 px-5 rounded-xl font-bold text-xs flex items-center justify-between shadow-md transition-all ${
              canConfirm
                ? "bg-brand hover:bg-brand-hover text-white cursor-pointer"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            <span>{canConfirm ? "Add to Cart" : validationMessage}</span>
            <span className="font-black text-sm">₹{grandTotalPaise / 100}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
