import { redis } from "@/lib/kv";

const TTL_30_DAYS = 60 * 60 * 24 * 30;

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export async function recordGeneration(
  email: string,
  latencyMs: number,
  tokens: { prompt: number; completion: number },
): Promise<void> {
  const date = today();
  const pipeline = redis.pipeline();

  pipeline.incr(`metrics:gen:${email}:${date}`);
  pipeline.expire(`metrics:gen:${email}:${date}`, TTL_30_DAYS);

  pipeline.lpush(`metrics:latency:${date}`, latencyMs);
  pipeline.expire(`metrics:latency:${date}`, TTL_30_DAYS);

  pipeline.hincrby(`metrics:tokens:${date}`, "prompt", tokens.prompt);
  pipeline.hincrby(`metrics:tokens:${date}`, "completion", tokens.completion);
  pipeline.expire(`metrics:tokens:${date}`, TTL_30_DAYS);

  await pipeline.exec();
}

export interface MetricsSnapshot {
  userCount: number;
  generations: { today: number; last30Days: number };
  latency: { todayAvgMs: number; todayP95Ms: number };
  tokens: {
    todayPrompt: number;
    todayCompletion: number;
    last30DaysPrompt: number;
    last30DaysCompletion: number;
  };
}

export async function getMetrics(): Promise<MetricsSnapshot> {
  const userCount = await redis.scard("users");
  const date = today();

  // Get last 30 days of dates
  const dates: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }

  // Gather generation counts across all users for each day
  const userEmails = await redis.smembers("users");
  let todayGens = 0;
  let totalGens = 0;

  for (const d of dates) {
    for (const email of userEmails) {
      const count = await redis.get<number>(`metrics:gen:${email}:${d}`);
      if (count) {
        totalGens += count;
        if (d === date) todayGens += count;
      }
    }
  }

  // Latency for today
  const latencies = await redis.lrange<number>(`metrics:latency:${date}`, 0, -1);
  let todayAvgMs = 0;
  let todayP95Ms = 0;
  if (latencies.length > 0) {
    todayAvgMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const sorted = [...latencies].sort((a, b) => a - b);
    todayP95Ms = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
  }

  // Tokens
  let todayPrompt = 0;
  let todayCompletion = 0;
  let last30DaysPrompt = 0;
  let last30DaysCompletion = 0;

  for (const d of dates) {
    const tokens = await redis.hgetall<{ prompt: string; completion: string }>(`metrics:tokens:${d}`);
    if (tokens) {
      const p = parseInt(tokens.prompt || "0", 10);
      const c = parseInt(tokens.completion || "0", 10);
      last30DaysPrompt += p;
      last30DaysCompletion += c;
      if (d === date) {
        todayPrompt = p;
        todayCompletion = c;
      }
    }
  }

  return {
    userCount,
    generations: { today: todayGens, last30Days: totalGens },
    latency: { todayAvgMs, todayP95Ms },
    tokens: { todayPrompt, todayCompletion, last30DaysPrompt, last30DaysCompletion },
  };
}
