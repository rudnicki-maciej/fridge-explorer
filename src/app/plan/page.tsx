"use client";

import { useState, useEffect } from "react";
import { useSettings, useSupplies, useDailyPlan } from "@/lib/storage";
import { deductIngredients, restoreIngredients } from "@/lib/supply-math";
import { SNACK_CALORIE_RESERVE } from "@/lib/constants";
import type { GenerateMealsResponse, MealSet, Snack } from "@/types";

export default function PlanPage() {
  const { settings, loaded: settingsLoaded } = useSettings();
  const { supplies, updateSupplies, loaded: suppliesLoaded } = useSupplies();
  const { plan, savePlan, clearPlan, loaded: planLoaded } = useDailyPlan();

  const [mealSets, setMealSets] = useState<MealSet[]>([]);
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverChecked, setServerChecked] = useState(false);
  const [repicking, setRepicking] = useState(false);
  const [repickOptions, setRepickOptions] = useState<MealSet[]>([]);

  const loaded = settingsLoaded && suppliesLoaded && planLoaded;

  // Try fetching pre-generated plan from server on mount
  useEffect(() => {
    if (!loaded || plan || serverChecked) return;

    const stocked = Object.keys(supplies);
    if (stocked.length === 0) {
      // Use a microtask to avoid synchronous setState in effect body
      queueMicrotask(() => setServerChecked(true));
      return;
    }

    fetch("/api/plan/today")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: (GenerateMealsResponse & { pregenerated: boolean }) | null) => {
        if (data?.mealSets?.length) {
          setMealSets(data.mealSets);
          setSnacks(data.snacks ?? []);
        }
      })
      .catch((err) => console.error("[plan] fetch failed:", err))
      .finally(() => setServerChecked(true));
  }, [loaded, plan, serverChecked, supplies]);

  if (!loaded) return null;

  const stocked = Object.keys(supplies);

  const generatePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplies,
          dailyCalorieTarget: settings.dailyCalorieTarget,
          disallowList: settings.disallowList,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate");
      }
      const data: GenerateMealsResponse = await res.json();
      setMealSets(data.mealSets);
      setSnacks(data.snacks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const pickSet = (set: MealSet) => {
    if (!confirm("Pick this set? Ingredients will be deducted from your supplies.")) return;

    const usedIngredients = [
      ...set.breakfast.ingredients,
      ...set.lunch.ingredients,
      ...set.dinner.ingredients,
    ];
    const today = new Date().toISOString().split("T")[0];
    savePlan({ date: today, chosenSetId: set.id, mealSet: set, deductedIngredients: usedIngredients });

    const next = deductIngredients(supplies, usedIngredients);
    updateSupplies(next);
    setMealSets([]);
  };

  const startRepick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/today?options=true");
      if (!res.ok) throw new Error("Could not load options");
      const data: GenerateMealsResponse = await res.json();
      setRepickOptions(data.mealSets);
      setRepicking(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const repickSet = (set: MealSet) => {
    if (!plan) return;
    if (!confirm("Switch to this set? Your supplies will be updated.")) return;

    const restored = restoreIngredients(supplies, plan.deductedIngredients);
    const usedIngredients = [
      ...set.breakfast.ingredients,
      ...set.lunch.ingredients,
      ...set.dinner.ingredients,
    ];
    const next = deductIngredients(restored, usedIngredients);
    updateSupplies(next);

    const today = new Date().toISOString().split("T")[0];
    savePlan({ date: today, chosenSetId: set.id, mealSet: set, deductedIngredients: usedIngredients });
    setRepicking(false);
    setRepickOptions([]);
  };

  const resetPlan = async () => {
    if (!plan) return;
    if (!confirm("Reset today's plan? Your supplies will be restored.")) return;

    if (plan.deductedIngredients?.length) {
      const restored = restoreIngredients(supplies, plan.deductedIngredients);
      updateSupplies(restored);
    }
    clearPlan();

    try {
      const res = await fetch("/api/plan/today?options=true");
      if (res.ok) {
        const data: GenerateMealsResponse = await res.json();
        setMealSets(data.mealSets);
        setSnacks(data.snacks ?? []);
      }
    } catch (e) {
      console.warn("[plan] failed to fetch options after reset:", e);
    }
  };

  if (plan && repicking) {
    return (
      <div className="mx-auto max-w-lg space-y-6 p-6">
        <h1 className="text-2xl font-bold">Change Your Pick</h1>
        <p className="text-sm text-zinc-500">Select a different set for today.</p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="space-y-6">
          {repickOptions.map((set) => (
            <div
              key={set.id}
              className={`space-y-3 rounded-lg border p-4 ${
                set.id === plan.chosenSetId
                  ? "border-green-400 bg-green-50 dark:bg-green-950/20"
                  : "border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium capitalize">
                  {set.id.replace("-", " ")}
                  {set.id === plan.chosenSetId && (
                    <span className="ml-2 text-xs text-green-600">(current)</span>
                  )}
                </h3>
                <span className="text-xs text-zinc-500">{set.totalCalories} kcal</span>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Breakfast:</span> {set.breakfast.name}</p>
                <p><span className="font-medium">Lunch:</span> {set.lunch.name}</p>
                <p><span className="font-medium">Dinner:</span> {set.dinner.name}</p>
              </div>
              {set.id !== plan.chosenSetId && (
                <button
                  onClick={() => repickSet(set)}
                  className="w-full rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
                >
                  Pick this set
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => { setRepicking(false); setRepickOptions([]); }}
          className="text-sm text-zinc-400 underline hover:text-zinc-600"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (plan) {
    return (
      <div className="mx-auto max-w-lg space-y-6 p-6">
        <h1 className="text-2xl font-bold">Today&apos;s Plan</h1>
        <div className="space-y-4">
          <MealCard meal={plan.mealSet.breakfast} />
          <MealCard meal={plan.mealSet.lunch} />
          <MealCard meal={plan.mealSet.dinner} />
        </div>
        <p className="text-sm text-zinc-500">
          Total: {plan.mealSet.totalCalories} kcal (+ {SNACK_CALORIE_RESERVE} kcal snacks)
        </p>
        {snacks.length > 0 && <SnackSection snacks={snacks} />}
        <div className="flex items-center gap-4">
          <button
            onClick={startRepick}
            disabled={loading}
            className="text-sm text-blue-600 underline hover:text-blue-800 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Change pick"}
          </button>
          <button
            onClick={resetPlan}
            className="text-sm text-zinc-400 underline hover:text-zinc-600"
          >
            Reset today&apos;s plan
          </button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-bold">Plan Your Day</h1>

      {stocked.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No supplies stocked.{" "}
          <a href="/supplies" className="underline">
            Add some first
          </a>
          .
        </p>
      ) : !serverChecked ? (
        <p className="text-sm text-zinc-500">Loading your plan...</p>
      ) : mealSets.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">
            Generate coordinated meal sets from your {stocked.length} stocked
            categories.
          </p>
          <button
            onClick={generatePlan}
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "Generating..." : "Generate Meal Plan"}
          </button>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-zinc-500">
            Pick one set for today. All 3 meals are coordinated for variety.
          </p>
          {mealSets.map((set) => (
            <div
              key={set.id}
              className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium capitalize">{set.id.replace("-", " ")}</h3>
                <span className="text-xs text-zinc-500">
                  {set.totalCalories} kcal
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Breakfast:</span>{" "}
                  {set.breakfast.name}
                </p>
                <p>
                  <span className="font-medium">Lunch:</span> {set.lunch.name}
                </p>
                <p>
                  <span className="font-medium">Dinner:</span>{" "}
                  {set.dinner.name}
                </p>
              </div>
              <button
                onClick={() => pickSet(set)}
                className="w-full rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
              >
                Pick this set
              </button>
            </div>
          ))}
          {snacks.length > 0 && <SnackSection snacks={snacks} />}
          <button
            onClick={() => {
              if (!confirm("Generate new options? This uses AI.")) return;
              generatePlan();
            }}
            disabled={loading}
            className="w-full rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {loading ? "Generating..." : "Try different options"}
          </button>
        </div>
      )}
    </div>
  );
}

function MealCard({ meal }: { meal: { name: string; description: string; calories: number; category: string } }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{meal.name}</h3>
        <span className="text-xs text-zinc-500">{meal.calories} kcal</span>
      </div>
      <p className="mt-1 text-sm text-zinc-500 capitalize">{meal.category}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {meal.description}
      </p>
    </div>
  );
}

function SnackSection({ snacks }: { snacks: Snack[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Snack Options (~200 kcal each)</h2>
      <div className="grid gap-2">
        {snacks.map((s, i) => (
          <div
            key={i}
            className="rounded border border-zinc-100 p-3 text-sm dark:border-zinc-800"
          >
            <span className="font-medium">{s.name}</span> — {s.description}
          </div>
        ))}
      </div>
    </section>
  );
}
