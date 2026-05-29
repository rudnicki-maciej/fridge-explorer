"use client";

import { useSyncStatus } from "@/lib/storage";

export function SyncToast() {
  const { syncError, dismissSyncError } = useSyncStatus();

  if (!syncError) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
    >
      <span>{syncError}</span>
      <button
        onClick={dismissSyncError}
        aria-label="Dismiss"
        className="font-bold hover:opacity-80"
      >
        ✕
      </button>
    </div>
  );
}
