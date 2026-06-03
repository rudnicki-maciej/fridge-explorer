import { expect, test } from "vitest";
import type { UserSettings } from "@/types";

test("vitest runs and @/ alias resolves", () => {
  const settings: UserSettings = { dailyCalorieTarget: 2000, disallowList: [] };
  expect(settings.dailyCalorieTarget).toBe(2000);
});
