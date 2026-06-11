import { describe, expect, test } from "vitest";
import { deductIngredients, mergeItems } from "@/lib/supply-math";
import type { Supplies, Ingredient } from "@/types";

describe("deductIngredients", () => {
  test(`reduces amounts across multiple ingredients`, () => {
    const supplies: Supplies = {
      chicken: { amount: 500, unit: "g" },
      rice: { amount: 300, unit: "g" },
    };
    const ingredients: Ingredient[] = [
      { name: "chicken", amount: 200, unit: "g" },
      { name: "rice", amount: 100, unit: "g" },
    ];

    const result = deductIngredients(supplies, ingredients);

    expect(result).toEqual({
      chicken: { amount: 300, unit: "g" },
      rice: { amount: 200, unit: "g" },
    });
  });

  test(`subtracts sequentially when same ingredient appears multiple times`, () => {
    const supplies: Supplies = {
      chicken: { amount: 500, unit: "g" },
    };
    const ingredients: Ingredient[] = [
      { name: "chicken", amount: 200, unit: "g" },
      { name: "chicken", amount: 200, unit: "g" },
    ];

    const result = deductIngredients(supplies, ingredients);

    expect(result).toEqual({ chicken: { amount: 100, unit: "g" } });
  });

  test(`removes item when amount reaches exactly zero`, () => {
    const supplies: Supplies = {
      milk: { amount: 250, unit: "ml" },
    };
    const ingredients: Ingredient[] = [{ name: "milk", amount: 250, unit: "ml" }];

    const result = deductIngredients(supplies, ingredients);

    expect(result).toEqual({});
  });

  test(`skips ingredient not present in supplies`, () => {
    const supplies: Supplies = {
      chicken: { amount: 500, unit: "g" },
    };
    const ingredients: Ingredient[] = [
      { name: "tofu", amount: 100, unit: "g" },
      { name: "chicken", amount: 100, unit: "g" },
    ];

    const result = deductIngredients(supplies, ingredients);

    expect(result).toEqual({ chicken: { amount: 400, unit: "g" } });
  });

  test(`removes item when deduction exceeds available amount`, () => {
    const supplies: Supplies = {
      eggs: { amount: 2, unit: "items" },
    };
    const ingredients: Ingredient[] = [{ name: "eggs", amount: 5, unit: "items" }];

    const result = deductIngredients(supplies, ingredients);

    expect(result).toEqual({});
  });

  test(`does not mutate the original supplies object`, () => {
    const supplies: Supplies = {
      chicken: { amount: 500, unit: "g" },
    };
    const ingredients: Ingredient[] = [{ name: "chicken", amount: 200, unit: "g" }];

    deductIngredients(supplies, ingredients);

    expect(supplies).toEqual({ chicken: { amount: 500, unit: "g" } });
  });
});

describe("mergeItems", () => {
  test(`sums amount when item name matches existing supply`, () => {
    const supplies: Supplies = {
      chicken: { amount: 300, unit: "g" },
    };

    const result = mergeItems(supplies, [{ name: "chicken", amount: 200, unit: "g" }]);

    expect(result).toEqual({ chicken: { amount: 500, unit: "g" } });
  });

  test(`adds new entry when item does not exist in supplies`, () => {
    const supplies: Supplies = {
      chicken: { amount: 300, unit: "g" },
    };

    const result = mergeItems(supplies, [{ name: "rice", amount: 200, unit: "g" }]);

    expect(result).toEqual({
      chicken: { amount: 300, unit: "g" },
      rice: { amount: 200, unit: "g" },
    });
  });

  test(`handles batch with both matching and new items`, () => {
    const supplies: Supplies = {
      chicken: { amount: 300, unit: "g" },
      milk: { amount: 500, unit: "ml" },
    };

    const result = mergeItems(supplies, [
      { name: "chicken", amount: 100, unit: "g" },
      { name: "rice", amount: 200, unit: "g" },
      { name: "milk", amount: 250, unit: "ml" },
    ]);

    expect(result).toEqual({
      chicken: { amount: 400, unit: "g" },
      milk: { amount: 750, unit: "ml" },
      rice: { amount: 200, unit: "g" },
    });
  });
});
