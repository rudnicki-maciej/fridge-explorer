"use client";

import { useSupplies } from "@/lib/storage";

export default function SuppliesPage() {
  const { supplies, loaded } = useSupplies();

  if (!loaded) return null;

  const items = Object.entries(supplies);

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-bold">My Supplies</h1>
      <p className="text-sm text-zinc-500">
        Supply management is being upgraded. Full UI coming soon.
      </p>
      <p className="text-xs text-zinc-400">
        {items.length} items in stock
      </p>
    </div>
  );
}
