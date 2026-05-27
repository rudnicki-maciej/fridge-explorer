"use client";

import { useState } from "react";
import { useSettings } from "@/lib/storage";

export default function SettingsPage() {
  const { settings, updateSettings, loaded } = useSettings();
  const [newItem, setNewItem] = useState("");

  if (!loaded) return null;

  const handleCalorieChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      updateSettings({ ...settings, dailyCalorieTarget: value });
    }
  };

  const addDisallowItem = () => {
    const item = newItem.trim().toLowerCase();
    if (item && !settings.disallowList.includes(item)) {
      updateSettings({
        ...settings,
        disallowList: [...settings.disallowList, item],
      });
      setNewItem("");
    }
  };

  const removeDisallowItem = (item: string) => {
    updateSettings({
      ...settings,
      disallowList: settings.disallowList.filter((i) => i !== item),
    });
  };

  return (
    <div className="mx-auto max-w-lg space-y-8 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-2">
        <label htmlFor="calories" className="block text-sm font-medium">
          Daily Calorie Target
        </label>
        <input
          id="calories"
          type="number"
          min={500}
          max={10000}
          step={50}
          value={settings.dailyCalorieTarget}
          onChange={handleCalorieChange}
          className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="text-xs text-zinc-500">
          400 kcal is reserved for snacks (2×200 kcal). Main meals target:{" "}
          {settings.dailyCalorieTarget - 400} kcal.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Dietary Disallow List</h2>
        <p className="text-xs text-zinc-500">
          Foods you never want suggested (e.g., onion, shellfish).
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDisallowItem()}
            placeholder="e.g. onion"
            className="flex-1 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={addDisallowItem}
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add
          </button>
        </div>
        {settings.disallowList.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {settings.disallowList.map((item) => (
              <li
                key={item}
                className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800"
              >
                {item}
                <button
                  onClick={() => removeDisallowItem(item)}
                  className="ml-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  aria-label={`Remove ${item}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
