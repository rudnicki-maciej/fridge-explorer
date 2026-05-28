"use client";

import { useState } from "react";
import { useSupplies } from "@/lib/storage";
import type { SupplyUnit } from "@/types";

interface ParsedItem {
  name: string;
  amount: number;
  unit: SupplyUnit;
}

export default function SuppliesPage() {
  const { supplies, addItems, removeItem, updateItem, loaded } = useSupplies();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (!loaded) return null;

  const items = Object.entries(supplies);

  const handleParse = async () => {
    if (!text.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/user/supplies/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to parse");
      }
      const data = await res.json();
      setParsed(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = () => {
    if (!parsed) return;
    addItems(parsed);
    setParsed(null);
    setText("");
  };

  const handleRemoveParsed = (index: number) => {
    if (!parsed) return;
    const next = parsed.filter((_, i) => i !== index);
    setParsed(next.length > 0 ? next : null);
  };

  const handleEditStart = (name: string, amount: number) => {
    setEditingItem(name);
    setEditValue(String(amount));
  };

  const handleEditSave = (name: string) => {
    const num = Number(editValue);
    if (!isNaN(num)) updateItem(name, num);
    setEditingItem(null);
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-bold">My Supplies</h1>

      <div className="space-y-3">
        <label htmlFor="supply-input" className="text-sm font-medium">
          Add supplies
        </label>
        <textarea
          id="supply-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "500g chicken breast, 2 limes, 300ml milk"'
          className="w-full rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          rows={2}
        />
        <button
          onClick={handleParse}
          disabled={parsing || !text.trim()}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {parsing ? "Parsing..." : "Add"}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {parsed && (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <p className="text-sm font-medium">Confirm items to add:</p>
          <ul className="space-y-2">
            {parsed.map((item, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{item.name} — {item.amount}{item.unit}</span>
                <button
                  onClick={() => handleRemoveParsed(i)}
                  aria-label={`Remove ${item.name}`}
                  className="text-zinc-400 hover:text-red-500"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={handleConfirm}
            className="w-full rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
          >
            Confirm
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No supplies yet. Type what you have above to get started.
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-400">{items.length} items in stock</p>
          <ul className="space-y-2">
            {items.map(([name, { amount, unit }]) => (
              <li
                key={name}
                className="flex items-center justify-between rounded-lg border border-zinc-100 p-3 dark:border-zinc-800"
              >
                <span className="text-sm">
                  {name} —{" "}
                  {editingItem === name ? (
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleEditSave(name)}
                      onKeyDown={(e) => e.key === "Enter" && handleEditSave(name)}
                      aria-label={`Edit amount for ${name}`}
                      className="w-16 rounded border border-zinc-300 px-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => handleEditStart(name, amount)}
                      className="underline decoration-dotted"
                    >
                      {amount}{unit}
                    </button>
                  )}
                </span>
                <button
                  onClick={() => removeItem(name)}
                  aria-label={`Delete ${name}`}
                  className="text-zinc-400 hover:text-red-500"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
