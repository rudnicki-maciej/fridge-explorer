---
project: "# TODO: project — see Open Questions"
version: 1
status: draft
created: 2026-05-21
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 4
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

A hard-working professional with limited daily planning time needs a way to turn what's already in the fridge and pantry into a balanced daily meal plan hitting an arbitrary calorie target — without requiring a store trip or detailed shopping list.

Existing tools go "plan → specific shopping list → cook". This app reverses the flow: "what I already have → 5 meals/day that hit my calorie target". Shopping guidance, if any, stays at the category level ("stock up on whole grains, vegetables, fruits") rather than demanding specific products — or uses a disallow-list to filter out unwanted items. The pain is workflow friction combined with a missing capability: no tool currently connects "available ingredients at home" to "balanced daily nutrition plan" without requiring detailed upfront meal planning.

## User & Persona

**Primary persona:** Myself — a hard-working professional who makes conscious choices when shopping (buying generally healthy categories) but lacks time for daily meal planning. Under time pressure, I grab whatever's available, resulting in unbalanced diet or needing extra meals to compensate for insufficient nutrition.

## Success Criteria

### Primary
- The full daily loop works end-to-end: one-time setup (calorie target + dietary preferences) → quick-add supplies after shopping → morning session (see 2–3 coordinated full-day meal sets) → pick one set → day is planned — all hitting the calorie target.

### Secondary
- Nutrition balance improves over time and user does not feel the need for extra snacks outside the plan.

### Guardrails
- Suggested meals must never include foods from the user's disallow-list.
- Suggested meals must never exceed the daily calorie target.

## User Stories

### US-01: User plans morning meals from available supplies

- **Given** a user with calorie target set, dietary preferences configured, and supplies logged
- **When** they open the app in the morning
- **Then** they see 2–3 breakfast options matching their supplies and preferences
- **When** they pick a breakfast
- **Then** they see a morning snack suggestion + 2–3 lunch options coordinated with the breakfast choice, all planned so that the full day (breakfast + snack + lunch + dinner + evening snack) stays within the daily calorie target

#### Acceptance Criteria
- All options respect the disallow-list
- The full 5-meal day is planned to sum to the daily calorie target (not just the morning portion)
- Supplies are reduced when a meal is picked
- No option requires ingredients not in current supplies

## Functional Requirements

### Setup & Preferences
- FR-001: User can set a daily calorie target (one-time, editable). Priority: must-have
  > Socrates: Counter-argument considered: "users might not know their correct calorie target — offering this without guidance could be harmful." Resolution: kept; user is health-conscious and sets their own target. Guidance could be a v2 feature.
- FR-002: User can set dietary preferences as a disallow-list (e.g., no onion, no seafood except fish). Priority: must-have
  > Socrates: Counter-argument considered: "preferences should be positive ('I like X') not just negative ('no Y') — a disallow-only model misses flavor preferences." Resolution: kept for MVP; positive preferences could enrich v2.
- FR-003: User can update calorie target and preferences at any time, but changes do not recalculate the current day's plan. Priority: must-have
  > Socrates: Counter-argument considered: "if someone realizes mid-day they set the wrong target, they're stuck with a bad plan until tomorrow." Resolution: kept; stability of the daily plan outweighs edge case of wrong target.

### Inventory
- FR-004: User can add supplies via category-based checklists (e.g., meat, dairy, grains, vegetables) — minimal typing. Priority: must-have
  > Socrates: Counter-argument considered: "category-level tracking without quantities means the app can't know when you've run out — it might suggest chicken for 5 days straight." Resolution: kept; quantity tracking is a real gap but adds significant complexity. Accept imprecision for MVP.
- FR-005: Picking a meal automatically reduces the corresponding supplies. Priority: must-have
  > Socrates: Counter-argument considered: "without quantity tracking, 'reducing supplies' is meaningless — how do you subtract from 'got vegetables'?" Resolution: kept; same tension as FR-004. Accept approximate tracking for MVP.

### Daily Meal Planning
- FR-006: User can view 2–3 breakfast options based on available supplies and preferences. Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-007: User sees 2–3 full-day meal sets (breakfast + lunch + dinner, coordinated) in one morning session. Priority: must-have
  > Socrates: No counter-argument; it stands as written. (Revised from split morning/evening sessions to single morning session for simpler coordination.)
- FR-008: User picks one full-day set; all 3 main meals are locked together. Priority: must-have
  > Socrates: Counter-argument considered: "coordinating dinner with two prior meals makes the algorithm significantly more complex." Resolution: revised — user picks a pre-coordinated set rather than individual meals sequentially. Complexity moves to set generation, not real-time coordination.
- FR-009: User can view available snack options from current supplies at any time, independent of the daily meal plan. Priority: must-have
  > Socrates: Counter-argument considered: "if snacks are universal and independent, why show them only after dinner? They could be shown anytime." Resolution: revised — snacks are now a separate lookup feature, not tied to the daily plan flow. Snacks budget is 2x200 kcal reserved from the daily target; main meals plan to the remainder.

### Coordination Logic
- FR-010: The 3 main meals (breakfast, lunch, dinner) are coordinated for variety across food groups (protein, vegetables, dairy, grains) — preventing repetitive same-nutrient meals. Priority: must-have
  > Socrates: Counter-argument considered: "'balanced nutrition' is vague and untestable." Resolution: refined — balanced = variety across food groups, not precise macro-tracking. Goal is preventing "pasta with tuna every day."
- FR-011: The 2 snacks (morning + evening) are small (200 kcal each) and universal — not impacted by main meal choices. Priority: must-have
  > Socrates: No counter-argument; it stands as written.

## Non-Functional Requirements

- Plan generation is perceived as instant (< 2 seconds from opening the app to seeing options).
- Accessible on multiple devices (phone, laptop, tablet) via a single app — no platform-specific installs required.
- Offline access is not required for MVP.

## Business Logic

Being aware of available products, calorie target and dietary preferences, the app plans daily meal sets with wide variety of food-groups for maximizing access to different nutrients.

Inputs: available supplies (from category checklists), daily calorie target, dietary disallow-list.

Output: 2–3 coordinated full-day meal sets (breakfast + lunch + dinner) that fit within the calorie budget (daily target minus 400 kcal snack reserve) while maximizing food-group variety across the three meals.

The user encounters this rule every morning: open app → see generated sets → pick one → day is planned. Snacks are a separate lookup — available anytime, independent of the chosen meal set.

## Access Control

Multi-device sync with minimal auth. Single user accessing the same data across phone, laptop, and tablet. Lightweight mechanism to connect devices (e.g., link/code or simple account) — no role separation needed.

## Non-Goals

- No multi-user / family meal coordination — MVP is single user only; no per-member targets or shared household planning.
- No receipt scanning / automatic inventory tracking — supplies are manual category checklists only.
- No building a custom recipe database from scratch — recipes come from a curated or external source, not user-generated content.
- No offline-first capability — requires internet connection; no offline mode.
- No precise macro/micronutrient tracking — variety across food groups, not clinical nutrition analysis.

## Open Questions

1. **Project name?** — TBD by user. The project has no name yet.
2. **Should the app provide category-level shopping guidance or a disallow-list?** — Parked. Decide after MVP core loop ("fridge → daily plan") is validated. Could be v2.
3. **Resupply nudge: should the app flag when a suggested meal requires items not in current supplies?** — Nice-to-have. No specific quantity tracking in MVP, but could warn based on category-level inventory.
4. **How does approximate inventory tracking work without quantities?** — FR-004 and FR-005 accept imprecision for MVP. The mechanism for "reducing supplies" at category level needs design during implementation.
