import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import type { UserData } from "@/lib/kv";

vi.mock("@/lib/kv", () => ({
  redis: { set: vi.fn().mockResolvedValue("OK") },
  getAllUserIds: vi.fn(),
  getUser: vi.fn(),
  setUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/generate", () => ({
  generateMealPlan: vi.fn(),
  computeInputHash: vi.fn().mockReturnValue("hash-abc"),
}));

const { redis, getAllUserIds, getUser } = await import("@/lib/kv");
const { generateMealPlan } = await import("@/lib/generate");
const { POST } = await import("../route");

function buildUser(overrides: Partial<UserData> = {}): UserData {
  return {
    settings: { dailyCalorieTarget: 2000, disallowList: [] },
    supplies: { Chicken: { amount: 500, unit: "g" } },
    pregenerated: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function cronRequest(): Request {
  return new Request("http://localhost/api/cron/generate", {
    method: "POST",
    headers: { Authorization: "Bearer test-cron-secret" },
  });
}

function targetDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split("T")[0];
}

describe("/api/cron/generate — health signal", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.resetAllMocks();
  });

  test("writes health key with generated count on successful generation", async () => {
    // given
    vi.mocked(getAllUserIds).mockResolvedValue(["user@test.dev"]);
    vi.mocked(getUser).mockResolvedValue(buildUser());
    vi.mocked(generateMealPlan).mockResolvedValue({ mealSets: [], snacks: [] });

    // when
    await POST(cronRequest());

    // then
    expect(redis.set).toHaveBeenCalledWith(
      `cron:lastSuccess:${targetDate()}`,
      expect.objectContaining({ generated: 1, skipped: 0, failed: 0 }),
    );
  });

  test("writes health key with failed count when generation returns null", async () => {
    // given
    vi.mocked(getAllUserIds).mockResolvedValue(["user@test.dev"]);
    vi.mocked(getUser).mockResolvedValue(buildUser());
    vi.mocked(generateMealPlan).mockResolvedValue(null);

    // when
    await POST(cronRequest());

    // then
    expect(redis.set).toHaveBeenCalledWith(
      `cron:lastSuccess:${targetDate()}`,
      expect.objectContaining({ generated: 0, skipped: 0, failed: 1 }),
    );
  });

  test("writes accurate counts for mixed batch", async () => {
    // given — 3 users: one generates, one skipped (no supplies), one fails
    vi.mocked(getAllUserIds).mockResolvedValue(["gen@t.dev", "skip@t.dev", "fail@t.dev"]);
    vi.mocked(getUser).mockImplementation(async (id: string) => {
      if (id === "skip@t.dev") return buildUser({ supplies: {} });
      return buildUser();
    });
    vi.mocked(generateMealPlan).mockImplementation(async (_s, _sup, userId) => {
      if (userId === "fail@t.dev") return null;
      return { mealSets: [], snacks: [] };
    });

    // when
    await POST(cronRequest());

    // then
    expect(redis.set).toHaveBeenCalledWith(
      `cron:lastSuccess:${targetDate()}`,
      expect.objectContaining({ generated: 1, skipped: 1, failed: 1 }),
    );
  });
});
