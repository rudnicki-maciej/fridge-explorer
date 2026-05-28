"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import type { UserSettings, Supplies, DailyPlan } from "@/types";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function useMounted() {
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
}

function getItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const stored = localStorage.getItem(key);
  if (!stored) return fallback;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

function setItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

const KEYS = {
  settings: "fridge-explorer:settings",
  supplies: "fridge-explorer:supplies",
  dailyPlan: "fridge-explorer:daily-plan",
} as const;

const DEFAULT_SETTINGS: UserSettings = {
  dailyCalorieTarget: 2000,
  disallowList: [],
};

function syncToServer(path: string, data: unknown) {
  fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).catch(() => {});
}

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(() =>
    getItem(KEYS.settings, DEFAULT_SETTINGS)
  );
  const mounted = useMounted();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    fetch("/api/user/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UserSettings | null) => {
        if (data) {
          setSettings(data);
          setItem(KEYS.settings, data);
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const updateSettings = useCallback((next: UserSettings) => {
    setSettings(next);
    setItem(KEYS.settings, next);
    syncToServer("/api/user/settings", next);
  }, []);

  const loaded = mounted && hydrated;

  return { settings, updateSettings, loaded };
}

const DEFAULT_SUPPLIES: Supplies = {};

export function useSupplies() {
  const [supplies, setSupplies] = useState<Supplies>(() =>
    getItem(KEYS.supplies, DEFAULT_SUPPLIES)
  );
  const mounted = useMounted();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    fetch("/api/user/supplies")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Supplies | null) => {
        if (data) {
          setSupplies(data);
          setItem(KEYS.supplies, data);
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const updateSupplies = useCallback((next: Supplies) => {
    setSupplies(next);
    setItem(KEYS.supplies, next);
    syncToServer("/api/user/supplies", next);
  }, []);

  return { supplies, updateSupplies, loaded: mounted && hydrated };
}

export function useDailyPlan() {
  const [plan, setPlan] = useState<DailyPlan | null>(() => {
    const stored = getItem<DailyPlan | null>(KEYS.dailyPlan, null);
    const today = new Date().toISOString().split("T")[0];
    return stored && stored.date === today ? stored : null;
  });
  const loaded = useMounted();

  const savePlan = useCallback((next: DailyPlan) => {
    setPlan(next);
    setItem(KEYS.dailyPlan, next);
  }, []);

  const clearPlan = useCallback(() => {
    setPlan(null);
    localStorage.removeItem(KEYS.dailyPlan);
  }, []);

  return { plan, savePlan, clearPlan, loaded };
}
