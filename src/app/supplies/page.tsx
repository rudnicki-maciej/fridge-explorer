"use client";

import { useSupplies } from "@/lib/storage";
import { SUPPLY_CATEGORIES } from "@/types";

export default function SuppliesPage() {
  const { supplies, toggleSupply, loaded } = useSupplies();

  if (!loaded) return null;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-bold">My Supplies</h1>
      <p className="text-sm text-zinc-500">
        Check what you currently have at home. This helps generate meal plans
        from your available ingredients.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SUPPLY_CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => toggleSupply(category)}
            className={`rounded-lg border px-4 py-3 text-sm font-medium capitalize transition-colors ${
              supplies[category]
                ? "border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                : "border-zinc-200 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
            }`}
            aria-pressed={!!supplies[category]}
          >
            {category}
          </button>
        ))}
      </div>

      <p className="text-xs text-zinc-400">
        {Object.values(supplies).filter(Boolean).length} of{" "}
        {SUPPLY_CATEGORIES.length} categories stocked
      </p>
    </div>
  );
}
