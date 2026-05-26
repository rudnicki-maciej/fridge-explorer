import { Redis } from "@upstash/redis";
import type { UserSettings, Supplies, MealSet, Snack } from "@/types";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL || "",
  token: process.env.KV_REST_API_TOKEN || "",
});

export interface UserData {
  settings: UserSettings;
  supplies: Supplies;
  pregenerated: {
    date: string;
    inputHash: string;
    mealSets: MealSet[];
    snacks: Snack[];
  } | null;
  updatedAt: string;
}

const DEFAULT_USER_DATA: UserData = {
  settings: { dailyCalorieTarget: 2000, disallowList: [] },
  supplies: {},
  pregenerated: null,
  updatedAt: new Date().toISOString(),
};

function userKey(userId: string) {
  return `user:${userId}`;
}

export async function getUser(userId: string): Promise<UserData | null> {
  return redis.get<UserData>(userKey(userId));
}

export async function setUser(userId: string, data: UserData): Promise<void> {
  await redis.set(userKey(userId), data);
}

export async function createUser(userId: string): Promise<UserData> {
  const data: UserData = { ...DEFAULT_USER_DATA, updatedAt: new Date().toISOString() };
  await redis.set(userKey(userId), data);
  // Track user in a set for cron iteration
  await redis.sadd("users", userId);
  return data;
}

export async function getAllUserIds(): Promise<string[]> {
  return redis.smembers("users");
}
