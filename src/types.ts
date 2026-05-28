export type SupplyUnit = "g" | "ml" | "items";

export interface SupplyItem {
  amount: number;
  unit: SupplyUnit;
}

export interface Supplies {
  [itemName: string]: SupplyItem;
}

export interface Ingredient {
  name: string;
  amount: number;
  unit: SupplyUnit;
}

export interface UserSettings {
  dailyCalorieTarget: number;
  disallowList: string[];
}

export interface Meal {
  name: string;
  description: string;
  calories: number;
  ingredients: Ingredient[];
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
  ingredients: Ingredient[];
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
