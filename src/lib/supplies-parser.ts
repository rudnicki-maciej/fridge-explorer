import type { SupplyUnit } from "@/types";

export async function parseSuppliesText(
  text: string,
  existingItems?: string[],
): Promise<{ name: string; amount: number; unit: SupplyUnit }[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const existingContext = existingItems?.length
    ? `\nExisting items for unit consistency: ${existingItems.join(", ")}`
    : "";

  const prompt = `Parse the following natural language text into a JSON object with an "items" array. Each item has: name (string, lowercase), amount (number, >0), unit ("g" | "ml" | "items").

Rules:
- If no quantity is specified, infer a sensible default (e.g., "chicken" → 500g, "limes" → 3 items, "milk" → 500ml)
- Use "g" for solid foods measured by weight
- Use "ml" for liquids
- Use "items" for countable whole items (eggs, limes, avocados, etc.)
- Keep item names short and specific (e.g., "chicken breast" not "boneless skinless chicken breast fillet")${existingContext}

Text: "${text}"

Respond ONLY with valid JSON: { "items": [{ "name": "...", "amount": 100, "unit": "g" }] }`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { items: { name: string; amount: number; unit: string }[] };
    if (!Array.isArray(parsed.items)) return null;

    const validUnits: SupplyUnit[] = ["g", "ml", "items"];
    const validated = parsed.items.filter(
      (item) =>
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        typeof item.amount === "number" &&
        item.amount > 0 &&
        validUnits.includes(item.unit as SupplyUnit),
    ).map((item) => ({
      name: item.name.trim().slice(0, 50).toLowerCase(),
      amount: item.amount,
      unit: item.unit as SupplyUnit,
    }));

    return validated.length > 0 ? validated : null;
  } catch {
    return null;
  }
}
