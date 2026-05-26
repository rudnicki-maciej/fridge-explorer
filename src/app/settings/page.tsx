"use client";

import { useState, useEffect } from "react";
import { useSettings } from "@/lib/storage";

function AccountSection() {
  const [code, setCode] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    // Check if already authenticated by looking for cookie existence via a lightweight call
    fetch("/api/plan/today").then((res) => {
      if (res.ok) setStatus("connected");
    }).catch(() => {});
  }, []);

  const createAccount = async () => {
    const res = await fetch("/api/auth/create", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setCode(data.code);
      setStatus("connected");
    }
  };

  const linkDevice = async () => {
    if (linkInput.length !== 6) return;
    const res = await fetch("/api/auth/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: linkInput }),
    });
    if (res.ok) {
      const data = await res.json();
      setCode(data.code);
      setStatus("connected");
    } else {
      setStatus("Code not found");
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Multi-Device Sync</h2>
      {status === "connected" && code && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-500">Your sync code (use on other devices):</p>
          <p className="font-mono text-lg font-bold tracking-widest">{code}</p>
        </div>
      )}
      {status === "connected" && !code && (
        <p className="text-xs text-green-600">✓ Connected</p>
      )}
      {status !== "connected" && (
        <div className="space-y-3">
          <button
            onClick={createAccount}
            className="w-full rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Create New Account
          </button>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value.toUpperCase())}
              placeholder="Enter 6-char code"
              className="flex-1 rounded border border-zinc-300 px-3 py-2 font-mono uppercase dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              onClick={linkDevice}
              className="rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Link
            </button>
          </div>
          {status && status !== "connected" && (
            <p className="text-xs text-red-500">{status}</p>
          )}
        </div>
      )}
    </section>
  );
}

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

      <AccountSection />
    </div>
  );
}
