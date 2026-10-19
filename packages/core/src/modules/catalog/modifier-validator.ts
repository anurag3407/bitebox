import { ModifierGroupDto, ModifierOptionDto } from "@startup/contracts";

export interface SelectedModifierValidationResult {
  isValid: boolean;
  optionsTotalPaise: number;
  selectedOptionNames: string[];
  error?: string;
}

export class ModifierValidator {
  static validate(
    modifierGroups: ModifierGroupDto[],
    selectedOptionIds: string[]
  ): SelectedModifierValidationResult {
    const selectedSet = new Set(selectedOptionIds);
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
        return {
          isValid: false,
          optionsTotalPaise: 0,
          selectedOptionNames: [],
          error: `Selected option ${optionId} does not exist in modifier groups for this item.`,
        };
      }
      if (!match.option.isAvailable) {
        return {
          isValid: false,
          optionsTotalPaise: 0,
          selectedOptionNames: [],
          error: `Selected option "${match.option.name}" is currently unavailable.`,
        };
      }
      optionsTotalPaise += match.option.pricePaise;
      selectedOptionNames.push(match.option.name);
    }

    // Validate min/max constraints per group
    for (const group of modifierGroups) {
      const selectedInGroup = group.options.filter((opt) => selectedSet.has(opt.id));
      const count = selectedInGroup.length;

      if (group.isRequired && count < group.minSelect) {
        return {
          isValid: false,
          optionsTotalPaise: 0,
          selectedOptionNames: [],
          error: `Modifier group "${group.name}" requires at least ${group.minSelect} selection(s), but ${count} were selected.`,
        };
      }

      if (count > group.maxSelect) {
        return {
          isValid: false,
          optionsTotalPaise: 0,
          selectedOptionNames: [],
          error: `Modifier group "${group.name}" allows at most ${group.maxSelect} selection(s), but ${count} were selected.`,
        };
      }
    }

    return {
      isValid: true,
      optionsTotalPaise,
      selectedOptionNames,
    };
  }
}
