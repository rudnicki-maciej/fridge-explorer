export const SUPPLY_CATEGORIES = [
  "meat",
  "fish",
  "dairy",
  "eggs",
  "grains",
  "bread",
  "pasta",
  "rice",
  "vegetables",
  "fruits",
  "legumes",
  "nuts",
  "oils",
  "spices",
  "sauces",
] as const;

export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];

export interface UserSettings {
  dailyCalorieTarget: number;
  disallowList: string[];
}

export interface Supplies {
  [category: string]: boolean;
}

export interface Meal {
  name: string;
  description: string;
  calories: number;
  ingredients: string[];
  category: "breakfast" | "lunch" | "dinner" | "snack";
}

export interface MealSet {
  id: string;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
  totalCalories: number;
}

export interface DailyPlan {
  date: string;
  chosenSetId: string;
  mealSet: MealSet;
}

export interface Snack {
  name: string;
  description: string;
  calories: number;
  ingredients: string[];
}

export interface GenerateMealsRequest {
  supplies: Supplies;
  dailyCalorieTarget: number;
  disallowList: string[];
}

export interface GenerateMealsResponse {
  mealSets: MealSet[];
  snacks: Snack[];
}
