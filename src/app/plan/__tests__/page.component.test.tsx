// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Supplies, MealSet, DailyPlan } from "@/types";

vi.mock("@/lib/storage", () => ({
  useSettings: vi.fn(),
  useSupplies: vi.fn(),
  useDailyPlan: vi.fn(),
}));

const { useSettings, useSupplies, useDailyPlan } = await import("@/lib/storage");
const { default: PlanPage } = await import("../page");

const mockUpdateSupplies = vi.fn();
const mockSavePlan = vi.fn();
const mockClearPlan = vi.fn();

const baseSupplies: Supplies = {
  "Chicken Breast": { amount: 500, unit: "g" },
  Rice: { amount: 300, unit: "g" },
  Eggs: { amount: 12, unit: "items" },
};

const setA: MealSet = {
  id: "set-a",
  breakfast: { name: "Omelette", description: "eggs", calories: 300, ingredients: [{ name: "Eggs", amount: 3, unit: "items" }], category: "breakfast" },
  lunch: { name: "Chicken Rice", description: "chicken with rice", calories: 500, ingredients: [{ name: "Chicken Breast", amount: 200, unit: "g" }, { name: "Rice", amount: 100, unit: "g" }], category: "lunch" },
  dinner: { name: "Grilled Chicken", description: "grilled", calories: 400, ingredients: [{ name: "Chicken Breast", amount: 150, unit: "g" }], category: "dinner" },
  totalCalories: 1200,
};

const setB: MealSet = {
  id: "set-b",
  breakfast: { name: "Rice Bowl", description: "rice", calories: 350, ingredients: [{ name: "Rice", amount: 150, unit: "g" }], category: "breakfast" },
  lunch: { name: "Egg Salad", description: "eggs", calories: 400, ingredients: [{ name: "Eggs", amount: 4, unit: "items" }], category: "lunch" },
  dinner: { name: "Chicken Stir Fry", description: "stir fry", calories: 450, ingredients: [{ name: "Chicken Breast", amount: 100, unit: "g" }], category: "dinner" },
  totalCalories: 1200,
};

function buildPlan(overrides: Partial<DailyPlan> = {}): DailyPlan {
  return {
    date: new Date().toISOString().split("T")[0],
    chosenSetId: setA.id,
    mealSet: setA,
    deductedIngredients: [
      { name: "Eggs", amount: 3, unit: "items" },
      { name: "Chicken Breast", amount: 200, unit: "g" },
      { name: "Rice", amount: 100, unit: "g" },
      { name: "Chicken Breast", amount: 150, unit: "g" },
    ],
    ...overrides,
  };
}

// Supplies AFTER setA was deducted: Chicken 150g, Rice 200g, Eggs 9
const suppliesAfterSetA: Supplies = {
  "Chicken Breast": { amount: 150, unit: "g" },
  Rice: { amount: 200, unit: "g" },
  Eggs: { amount: 9, unit: "items" },
};

function setupMocks(plan: DailyPlan | null, supplies: Supplies = suppliesAfterSetA) {
  vi.mocked(useSettings).mockReturnValue({ settings: { dailyCalorieTarget: 2000, disallowList: [] }, updateSettings: vi.fn(), loaded: true });
  vi.mocked(useSupplies).mockReturnValue({ supplies, updateSupplies: mockUpdateSupplies, addItems: vi.fn(), removeItem: vi.fn(), updateItem: vi.fn(), loaded: true });
  vi.mocked(useDailyPlan).mockReturnValue({ plan, savePlan: mockSavePlan, clearPlan: mockClearPlan, loaded: true });
}

describe("repickSet", () => {
  const originalFetch = global.fetch;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    window.confirm = vi.fn(() => true);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    window.confirm = originalConfirm;
    global.fetch = originalFetch;
    vi.resetAllMocks();
  });

  test(`yields original minus new set only (restore old then deduct new)`, async () => {
    // given — plan with setA deducted, supplies reflect that deduction
    const plan = buildPlan();
    setupMocks(plan);

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mealSets: [setA, setB], snacks: [] }),
    } as Response);

    render(<PlanPage />);

    // when — user clicks "Change pick" then picks setB
    await userEvent.click(screen.getByRole("button", { name: /change pick/i }));
    await waitFor(() => expect(screen.getByText("Change Your Pick")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /pick this set/i }));

    // then — updateSupplies called with original(500,300,12) minus setB ingredients
    // setB uses: Rice 150g, Eggs 4, Chicken 100g
    // Expected: Chicken 400g, Rice 150g, Eggs 8
    expect(mockUpdateSupplies).toHaveBeenCalledWith({
      "Chicken Breast": { amount: 400, unit: "g" },
      Rice: { amount: 150, unit: "g" },
      Eggs: { amount: 8, unit: "items" },
    });
  });

  test(`guard path: empty deductedIngredients deducts from raw supplies`, async () => {
    // given — plan with empty deductedIngredients (edge case)
    const plan = buildPlan({ deductedIngredients: [] });
    setupMocks(plan, baseSupplies);

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mealSets: [setA, setB], snacks: [] }),
    } as Response);

    render(<PlanPage />);

    // when — user clicks "Change pick" then picks setB
    await userEvent.click(screen.getByRole("button", { name: /change pick/i }));
    await waitFor(() => expect(screen.getByText("Change Your Pick")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /pick this set/i }));

    // then — no restore step, deducts directly from baseSupplies
    // setB: Rice 150g, Eggs 4, Chicken 100g
    // Expected: Chicken 400g, Rice 150g, Eggs 8
    expect(mockUpdateSupplies).toHaveBeenCalledWith({
      "Chicken Breast": { amount: 400, unit: "g" },
      Rice: { amount: 150, unit: "g" },
      Eggs: { amount: 8, unit: "items" },
    });
  });
});

describe("resetPlan", () => {
  const originalFetch = global.fetch;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    window.confirm = vi.fn(() => true);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    window.confirm = originalConfirm;
    global.fetch = originalFetch;
    vi.resetAllMocks();
  });

  test(`success: options visible after fetch resolves`, async () => {
    // given — stateful plan mock so clearPlan triggers re-render with plan=null
    const plan = buildPlan();
    let currentPlan: DailyPlan | null = plan;
    vi.mocked(useSettings).mockReturnValue({ settings: { dailyCalorieTarget: 2000, disallowList: [] }, updateSettings: vi.fn(), loaded: true });
    vi.mocked(useSupplies).mockReturnValue({ supplies: suppliesAfterSetA, updateSupplies: mockUpdateSupplies, addItems: vi.fn(), removeItem: vi.fn(), updateItem: vi.fn(), loaded: true });
    const clearPlanStateful = vi.fn(() => { currentPlan = null; });
    vi.mocked(useDailyPlan).mockImplementation(() => ({
      plan: currentPlan,
      savePlan: mockSavePlan,
      clearPlan: clearPlanStateful,
      loaded: true,
    }));

    // mockResolvedValue (not Once) — handles both the resetPlan fetch and
    // the useEffect that re-fires when plan becomes null
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ mealSets: [setB], snacks: [] }),
    } as Response);

    render(<PlanPage />);

    // when — user clicks "Reset today's plan"
    await userEvent.click(screen.getByRole("button", { name: /reset today/i }));

    // then — clearPlan called, supplies restored, options visible
    expect(clearPlanStateful).toHaveBeenCalled();
    expect(mockUpdateSupplies).toHaveBeenCalledWith(baseSupplies);
    await waitFor(() => expect(screen.getByText("Rice Bowl")).toBeInTheDocument());
  });

  test(`failure: error message visible after fetch rejects`, async () => {
    // given
    const plan = buildPlan();
    setupMocks(plan);

    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

    render(<PlanPage />);

    // when
    await userEvent.click(screen.getByRole("button", { name: /reset today/i }));

    // then
    expect(mockClearPlan).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText(/could not load your options/i)).toBeInTheDocument(),
    );
  });
});
