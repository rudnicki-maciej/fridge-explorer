"use client";

import { useState } from "react";
import { useSupplies, useSettings, useSnacks } from "@/lib/storage";

export default function SnacksPage() {
  const { supplies, loaded: suppliesLoaded } = useSupplies();
  const { settings, loaded: settingsLoaded } = useSettings();
  const { snacks, saveSnacks, loaded: snacksLoaded } = useSnacks();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loaded = suppliesLoaded && settingsLoaded && snacksLoaded;
  const hasSupplies = Object.keys(supplies).length > 0;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-snacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplies, disallowList: settings.disallowList }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to generate snacks");

        return;
      }
      const data = await res.json();
      saveSnacks(data.snacks);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  if (!loaded) return null;

  if (!hasSupplies) {
    return (
      <div className="mx-auto max-w-lg px-6 py-12 text-center">
        <p className="text-zinc-500">Add some supplies first to generate snack ideas.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold">Snack Ideas</h1>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "Generating..." : snacks.length > 0 ? "Refresh" : "Generate Snacks"}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {snacks.length > 0 && (
        <ul className="grid gap-4">
          {snacks.map((snack) => (
            <li
              key={snack.name}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{snack.name}</span>
                <span className="text-sm text-zinc-500">{snack.calories} kcal</span>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {snack.description}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
