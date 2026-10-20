import { ItemVariantDto, ModifierGroupDto, ModifierOptionDto } from "@startup/contracts";

export interface SelectedModifierValidationResult {
  isValid: boolean;
  optionsTotalPaise: number;
  selectedOptionNames: string[];
  error?: string;
}

function invalid(error: string): SelectedModifierValidationResult {
  return { isValid: false, optionsTotalPaise: 0, selectedOptionNames: [], error };
}

export class ModifierValidator {
  static validate(
    modifierGroups: ModifierGroupDto[],
    selectedOptionIds: string[]
  ): SelectedModifierValidationResult {
    const selectedSet = new Set(selectedOptionIds);
    // A repeated option id would otherwise be charged and counted twice
    if (selectedSet.size !== selectedOptionIds.length) {
      return invalid("The same add-on cannot be selected more than once.");
    }

    let optionsTotalPaise = 0;
    const selectedOptionNames: string[] = [];

    // Map each option ID to its option and parent group
    const optionMap = new Map<string, { option: ModifierOptionDto; group: ModifierGroupDto }>();
    for (const group of modifierGroups) {
      for (const option of group.options) {
        optionMap.set(option.id, { option, group });
      }
    }

    // Verify all selected option IDs exist and are available
    for (const optionId of selectedOptionIds) {
      const match = optionMap.get(optionId);
      if (!match) {
        return invalid(`Selected option ${optionId} does not exist in modifier groups for this item.`);
      }
      if (!match.option.isAvailable) {
        return invalid(`Selected option "${match.option.name}" is currently unavailable.`);
      }
      optionsTotalPaise += match.option.pricePaise;
      selectedOptionNames.push(match.option.name);
    }

    // Validate min/max constraints per group
    for (const group of modifierGroups) {
      const count = group.options.filter((opt) => selectedSet.has(opt.id)).length;
      const requiredMin = group.isRequired ? Math.max(1, group.minSelect) : group.minSelect;

      // Optional groups only enforce their minimum once the customer starts choosing
      if ((group.isRequired || count > 0) && count < requiredMin) {
        return invalid(
          `Modifier group "${group.name}" requires at least ${requiredMin} selection(s), but ${count} were selected.`
        );
      }

      if (count > group.maxSelect) {
        return invalid(
          `Modifier group "${group.name}" allows at most ${group.maxSelect} selection(s), but ${count} were selected.`
        );
      }
    }

    return {
      isValid: true,
      optionsTotalPaise,
      selectedOptionNames,
    };
  }

  /**
   * Items that are sold in portions must have a portion chosen, otherwise the
   * (often cheaper) base price would silently be charged.
   */
  static resolveVariant(
    itemName: string,
    variants: ItemVariantDto[],
    variantId: string | undefined
  ): { ok: true; variant?: ItemVariantDto } | { ok: false; error: string } {
    if (!variantId) {
      if (variants.some((v) => v.isAvailable)) {
        return { ok: false, error: `Please choose a portion size for "${itemName}".` };
      }
      return { ok: true };
    }
    const variant = variants.find((v) => v.id === variantId);
    if (!variant || !variant.isAvailable) {
      return { ok: false, error: `Selected portion for "${itemName}" is unavailable.` };
    }
    return { ok: true, variant };
  }
}
