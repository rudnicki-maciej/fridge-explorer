import type { Supplies, Ingredient, SupplyUnit } from "@/types";

export function deductIngredients(supplies: Supplies, ingredients: Ingredient[]): Supplies {
  const result = { ...supplies };
  for (const ingredient of ingredients) {
    if (result[ingredient.name]) {
      result[ingredient.name] = {
        ...result[ingredient.name],
        amount: result[ingredient.name].amount - ingredient.amount,
      };
      if (result[ingredient.name].amount <= 0) {
        delete result[ingredient.name];
      }
    }
  }
  return result;
}

export function mergeItems(
  supplies: Supplies,
  items: { name: string; amount: number; unit: SupplyUnit }[],
): Supplies {
  const result = { ...supplies };
  for (const item of items) {
    if (result[item.name]) {
      result[item.name] = { ...result[item.name], amount: result[item.name].amount + item.amount };
    } else {
      result[item.name] = { amount: item.amount, unit: item.unit };
    }
  }
  return result;
}
