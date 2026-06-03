import type { MealSet, Snack, UserSettings } from "@/types";
import { SNACK_CALORIE_RESERVE } from "@/lib/constants";

export function validateMealPlanConstraints(
  result: { mealSets: MealSet[]; snacks: Snack[] },
  settings: UserSettings,
): { mealSets: MealSet[]; snacks: Snack[] } | null {
  const mainCalories = settings.dailyCalorieTarget - SNACK_CALORIE_RESERVE;
  const caloriesCap = mainCalories * 1.1;
  const disallowLower = settings.disallowList.map((item) => item.toLowerCase());

  for (const set of result.mealSets) {
    // Disallow-list check
    for (const meal of [set.breakfast, set.lunch, set.dinner]) {
      for (const ingredient of meal.ingredients) {
        const nameLower = ingredient.name.toLowerCase();
        for (const blocked of disallowLower) {
          if (nameLower.includes(blocked)) {
            console.warn(
              `[constraint violation] disallow-list: ingredient "${ingredient.name}" contains blocked item "${blocked}"`,
            );

            return null;
          }
        }
      }
    }

    // Calorie sum consistency (±20 kcal tolerance)
    const mealSum = set.breakfast.calories + set.lunch.calories + set.dinner.calories;
    if (Math.abs(mealSum - set.totalCalories) > 20) {
      console.warn(
        `[constraint violation] calorie sum inconsistency: meals sum to ${mealSum} but totalCalories is ${set.totalCalories}`,
      );

      return null;
    }

    // Calorie cap check
    if (set.totalCalories > caloriesCap) {
      console.warn(
        `[constraint violation] calorie cap exceeded: totalCalories ${set.totalCalories} exceeds cap ${caloriesCap} (target ${settings.dailyCalorieTarget}, mainCalories ${mainCalories})`,
      );

      return null;
    }
  }

  return result;
}
