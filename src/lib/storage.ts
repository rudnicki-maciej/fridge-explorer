"use client";

import { useState, useEffect, useCallback } from "react";
import type { UserSettings, Supplies, DailyPlan } from "@/types";

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

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(getItem(KEYS.settings, DEFAULT_SETTINGS));
    setLoaded(true);
  }, []);

  const updateSettings = useCallback((next: UserSettings) => {
    setSettings(next);
    setItem(KEYS.settings, next);
  }, []);

  return { settings, updateSettings, loaded };
}

const DEFAULT_SUPPLIES: Supplies = {};

export function useSupplies() {
  const [supplies, setSupplies] = useState<Supplies>(DEFAULT_SUPPLIES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSupplies(getItem(KEYS.supplies, DEFAULT_SUPPLIES));
    setLoaded(true);
  }, []);

  const updateSupplies = useCallback((next: Supplies) => {
    setSupplies(next);
    setItem(KEYS.supplies, next);
  }, []);

  const toggleSupply = useCallback(
    (category: string) => {
      const next = { ...supplies, [category]: !supplies[category] };
      setSupplies(next);
      setItem(KEYS.supplies, next);
    },
    [supplies]
  );

  return { supplies, updateSupplies, toggleSupply, loaded };
}

export function useDailyPlan() {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = getItem<DailyPlan | null>(KEYS.dailyPlan, null);
    const today = new Date().toISOString().split("T")[0];
    if (stored && stored.date === today) {
      setPlan(stored);
    }
    setLoaded(true);
  }, []);

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
