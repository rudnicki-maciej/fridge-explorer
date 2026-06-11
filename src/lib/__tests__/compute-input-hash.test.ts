import { describe, expect, test } from "vitest";
import { computeInputHash } from "@/lib/generate";
import type { UserSettings, Supplies } from "@/types";

describe("computeInputHash", () => {
  const settings: UserSettings = {
    dailyCalorieTarget: 2000,
    disallowList: ["peanut"],
  };

  const supplies: Supplies = {
    "Chicken Breast": { amount: 500, unit: "g" },
    Rice: { amount: 300, unit: "g" },
  };

  test(`produces the same hash for identical inputs`, () => {
    // given
    const hash1 = computeInputHash(settings, supplies);
    const hash2 = computeInputHash(settings, supplies);

    // then
    expect(hash1).toBe(hash2);
  });

  test(`produces the same hash for different object references with same values`, () => {
    // given
    const settingsCopy: UserSettings = { dailyCalorieTarget: 2000, disallowList: ["peanut"] };
    const suppliesCopy: Supplies = { "Chicken Breast": { amount: 500, unit: "g" }, Rice: { amount: 300, unit: "g" } };

    // when
    const hash1 = computeInputHash(settings, supplies);
    const hash2 = computeInputHash(settingsCopy, suppliesCopy);

    // then
    expect(hash1).toBe(hash2);
  });

  test(`produces a different hash when dailyCalorieTarget changes`, () => {
    // given
    const changed: UserSettings = { ...settings, dailyCalorieTarget: 1800 };

    // when / then
    expect(computeInputHash(changed, supplies)).not.toBe(computeInputHash(settings, supplies));
  });

  test(`produces a different hash when disallowList changes`, () => {
    // given
    const changed: UserSettings = { ...settings, disallowList: ["peanut", "shellfish"] };

    // when / then
    expect(computeInputHash(changed, supplies)).not.toBe(computeInputHash(settings, supplies));
  });

  test(`produces a different hash when a supply item is added`, () => {
    // given
    const changed: Supplies = { ...supplies, Broccoli: { amount: 200, unit: "g" } };

    // when / then
    expect(computeInputHash(settings, changed)).not.toBe(computeInputHash(settings, supplies));
  });

  test(`produces a different hash when a supply amount changes`, () => {
    // given
    const changed: Supplies = { ...supplies, "Chicken Breast": { amount: 400, unit: "g" } };

    // when / then
    expect(computeInputHash(settings, changed)).not.toBe(computeInputHash(settings, supplies));
  });
});
