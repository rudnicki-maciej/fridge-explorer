import { describe, expect, test, vi } from "vitest";
import { validateMealPlanConstraints } from "@/lib/validate-constraints";
import type { MealSet, Meal, Snack, UserSettings } from "@/types";

function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    name: "Test Meal",
    description: "A test meal",
    calories: 500,
    ingredients: [{ name: "Chicken Breast", amount: 200, unit: "g" }],
    category: "lunch",
    ...overrides,
  };
}

function makeMealSet(overrides: Partial<MealSet> = {}): MealSet {
  const breakfast = overrides.breakfast ?? makeMeal({ calories: 400, category: "breakfast" });
  const lunch = overrides.lunch ?? makeMeal({ calories: 600, category: "lunch" });
  const dinner = overrides.dinner ?? makeMeal({ calories: 600, category: "dinner" });

  return {
    id: "set-1",
    breakfast,
    lunch,
    dinner,
    totalCalories: overrides.totalCalories ?? (breakfast.calories + lunch.calories + dinner.calories),
    ...overrides,
  };
}

function makeResult(mealSets: MealSet[] = [makeMealSet()]) {
  return { mealSets, snacks: [] as Snack[] };
}

const baseSettings: UserSettings = {
  dailyCalorieTarget: 2000, // mainCalories = 1600, cap = 1760
  disallowList: [],
};

describe("validateMealPlanConstraints", () => {
  describe("disallow-list enforcement", () => {
    test("returns result when no ingredients match disallow-list", () => {
      const result = makeResult();
      const settings = { ...baseSettings, disallowList: ["peanut"] };

      expect(validateMealPlanConstraints(result, settings)).toBe(result);
    });

    test("returns null when ingredient contains disallowed item as substring", () => {
      const result = makeResult([
        makeMealSet({
          lunch: makeMeal({
            ingredients: [{ name: "Red Onion", amount: 50, unit: "g" }],
          }),
        }),
      ]);
      const settings = { ...baseSettings, disallowList: ["onion"] };

      expect(validateMealPlanConstraints(result, settings)).toBeNull();
    });

    test("returns null on case mismatch", () => {
      const result = makeResult([
        makeMealSet({
          breakfast: makeMeal({
            ingredients: [{ name: "Peanut Butter", amount: 30, unit: "g" }],
          }),
        }),
      ]);
      const settings = { ...baseSettings, disallowList: ["PEANUT"] };

      expect(validateMealPlanConstraints(result, settings)).toBeNull();
    });

    test("returns result when disallow-list is empty", () => {
      const result = makeResult();
      const settings = { ...baseSettings, disallowList: [] };

      expect(validateMealPlanConstraints(result, settings)).toBe(result);
    });

    test("catches substring match even when it over-matches (accepted behavior)", () => {
      const result = makeResult([
        makeMealSet({
          dinner: makeMeal({
            ingredients: [{ name: "Rice", amount: 150, unit: "g" }],
          }),
        }),
      ]);
      const settings = { ...baseSettings, disallowList: ["ice"] };

      expect(validateMealPlanConstraints(result, settings)).toBeNull();
    });
  });

  describe("calorie sum consistency", () => {
    test("returns result when meal calories sum equals totalCalories", () => {
      const result = makeResult([makeMealSet()]);

      expect(validateMealPlanConstraints(result, baseSettings)).toBe(result);
    });

    test("returns null when sum differs from totalCalories by > 20 kcal", () => {
      const result = makeResult([
        makeMealSet({
          breakfast: makeMeal({ calories: 400, category: "breakfast" }),
          lunch: makeMeal({ calories: 600, category: "lunch" }),
          dinner: makeMeal({ calories: 600, category: "dinner" }),
          totalCalories: 1579, // sum is 1600, diff is 21
        }),
      ]);

      expect(validateMealPlanConstraints(result, baseSettings)).toBeNull();
    });

    test("returns result when sum differs by exactly 20 kcal (boundary)", () => {
      const result = makeResult([
        makeMealSet({
          breakfast: makeMeal({ calories: 400, category: "breakfast" }),
          lunch: makeMeal({ calories: 600, category: "lunch" }),
          dinner: makeMeal({ calories: 600, category: "dinner" }),
          totalCalories: 1580, // sum is 1600, diff is 20
        }),
      ]);

      expect(validateMealPlanConstraints(result, baseSettings)).toBe(result);
    });
  });

  describe("calorie target cap", () => {
    test("returns result when totalCalories exactly at mainCalories × 1.10 (boundary)", () => {
      // mainCalories = 2000 - 400 = 1600, cap = 1760
      const result = makeResult([
        makeMealSet({
          breakfast: makeMeal({ calories: 560, category: "breakfast" }),
          lunch: makeMeal({ calories: 600, category: "lunch" }),
          dinner: makeMeal({ calories: 600, category: "dinner" }),
          totalCalories: 1760,
        }),
      ]);

      expect(validateMealPlanConstraints(result, baseSettings)).toBe(result);
    });

    test("returns null when totalCalories is 1 kcal above cap", () => {
      // cap = 1760, so 1761 should fail
      const result = makeResult([
        makeMealSet({
          breakfast: makeMeal({ calories: 561, category: "breakfast" }),
          lunch: makeMeal({ calories: 600, category: "lunch" }),
          dinner: makeMeal({ calories: 600, category: "dinner" }),
          totalCalories: 1761,
        }),
      ]);

      expect(validateMealPlanConstraints(result, baseSettings)).toBeNull();
    });

    test("returns result when totalCalories is below mainCalories", () => {
      const result = makeResult([
        makeMealSet({
          breakfast: makeMeal({ calories: 300, category: "breakfast" }),
          lunch: makeMeal({ calories: 400, category: "lunch" }),
          dinner: makeMeal({ calories: 400, category: "dinner" }),
          totalCalories: 1100,
        }),
      ]);

      expect(validateMealPlanConstraints(result, baseSettings)).toBe(result);
    });
  });

  describe("multiple meal sets", () => {
    test("returns null when first set is valid but second set violates", () => {
      const validSet = makeMealSet();
      const violatingSet = makeMealSet({
        id: "set-2",
        lunch: makeMeal({
          ingredients: [{ name: "Shrimp Paste", amount: 20, unit: "g" }],
        }),
      });
      const result = makeResult([validSet, violatingSet]);
      const settings = { ...baseSettings, disallowList: ["shrimp"] };

      expect(validateMealPlanConstraints(result, settings)).toBeNull();
    });
  });

  test("logs warning on violation", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = makeResult([
      makeMealSet({
        breakfast: makeMeal({
          ingredients: [{ name: "Peanut Butter", amount: 30, unit: "g" }],
        }),
      }),
    ]);
    const settings = { ...baseSettings, disallowList: ["peanut"] };

    validateMealPlanConstraints(result, settings);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[constraint violation]"),
    );
    warnSpy.mockRestore();
  });
});
