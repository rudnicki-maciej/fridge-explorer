import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import type { UserData } from "@/lib/kv";
import type { UserSettings, Supplies, MealSet, Snack } from "@/types";
import { computeInputHash } from "@/lib/generate";

vi.mock("@/lib/kv", () => ({
  getUser: vi.fn(),
  setUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  verifySession: vi.fn(),
}));

vi.mock("@/lib/metrics", () => ({
  recordGeneration: vi.fn().mockResolvedValue(undefined),
}));

const { getUser } = await import("@/lib/kv");
const { verifySession } = await import("@/lib/auth");
const { GET } = await import("../route");

const settings: UserSettings = {
  dailyCalorieTarget: 2000,
  disallowList: ["peanut"],
};

const supplies: Supplies = {
  "Chicken Breast": { amount: 500, unit: "g" },
  Rice: { amount: 300, unit: "g" },
};

function today(): string {
  return new Date().toISOString().split("T")[0];
}

const mealSets: MealSet[] = [{ id: "set-1", breakfast: { name: "B", description: "b", calories: 400, ingredients: [{ name: "Chicken Breast", amount: 100, unit: "g" }], category: "breakfast" }, lunch: { name: "L", description: "l", calories: 600, ingredients: [{ name: "Rice", amount: 100, unit: "g" }], category: "lunch" }, dinner: { name: "D", description: "d", calories: 600, ingredients: [{ name: "Chicken Breast", amount: 100, unit: "g" }], category: "dinner" }, totalCalories: 1600 }];
const snacks: Snack[] = [{ name: "S", description: "s", calories: 200, ingredients: [{ name: "Rice", amount: 50, unit: "g" }] }];

function buildUser(overrides: Partial<NonNullable<UserData["pregenerated"]>> = {}): UserData {
  const hash = computeInputHash(settings, supplies);
  return {
    settings,
    supplies,
    pregenerated: { date: today(), inputHash: hash, mealSets, snacks, ...overrides },
    updatedAt: new Date().toISOString(),
  };
}

describe("/api/plan/today", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.mocked(verifySession).mockResolvedValue("user@test.dev");
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
    vi.resetAllMocks();
  });

  test(`returns cached plan without calling fetch when pregenerated is valid`, async () => {
    // given
    const user = buildUser();
    vi.mocked(getUser).mockResolvedValue(user);

    // when
    const response = await GET(new Request("http://localhost/api/plan/today"));
    const body = await response.json();

    // then
    expect(global.fetch).not.toHaveBeenCalled();
    expect(body).toEqual({ mealSets, snacks, pregenerated: true });
  });

  test(`calls fetch when pregenerated date is stale`, async () => {
    // given
    const user = buildUser({ date: "2020-01-01" });
    vi.mocked(getUser).mockResolvedValue(user);

    // when
    await GET(new Request("http://localhost/api/plan/today"));

    // then — fetch was called, proving on-demand LLM generation was triggered
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test(`calls fetch when inputHash does not match`, async () => {
    // given
    const user = buildUser({ inputHash: "mismatched-hash" });
    vi.mocked(getUser).mockResolvedValue(user);

    // when
    await GET(new Request("http://localhost/api/plan/today"));

    // then — fetch was called, proving on-demand LLM generation was triggered
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("/api/plan/today?options=true", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.mocked(verifySession).mockResolvedValue("user@test.dev");
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  test(`returns 200 with mealSets when pregenerated date matches today`, async () => {
    // given
    const user = buildUser();
    vi.mocked(getUser).mockResolvedValue(user);

    // when
    const response = await GET(new Request("http://localhost/api/plan/today?options=true"));
    const body = await response.json();

    // then
    expect(response.status).toBe(200);
    expect(body).toEqual({ mealSets, snacks, pregenerated: true });
  });

  test(`returns 404 when pregenerated date is yesterday`, async () => {
    // given
    const user = buildUser({ date: "2020-01-01" });
    vi.mocked(getUser).mockResolvedValue(user);

    // when
    const response = await GET(new Request("http://localhost/api/plan/today?options=true"));
    const body = await response.json();

    // then
    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "No options for today" });
  });

  test(`returns 200 at 23:30 UTC when pregenerated date matches UTC today`, async () => {
    // given — server clock at 23:30 UTC on June 11 (UTC date is still "2026-06-11")
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T23:30:00.000Z"));
    const user = buildUser({ date: "2026-06-11" });
    vi.mocked(getUser).mockResolvedValue(user);

    // when
    const response = await GET(new Request("http://localhost/api/plan/today?options=true"));

    // then
    expect(response.status).toBe(200);
  });

  test(`returns 404 at 00:30 UTC next day when pregenerated date is yesterday`, async () => {
    // given — server clock at 00:30 UTC on June 12 (UTC date is "2026-06-12")
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T00:30:00.000Z"));
    const user = buildUser({ date: "2026-06-11" });
    vi.mocked(getUser).mockResolvedValue(user);

    // when
    const response = await GET(new Request("http://localhost/api/plan/today?options=true"));
    const body = await response.json();

    // then
    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "No options for today" });
  });
});
