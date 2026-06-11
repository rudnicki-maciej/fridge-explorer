import { describe, expect, test, vi, beforeEach } from "vitest";

const mockGetdel = vi.fn();
const mockDel = vi.fn();

vi.mock("@/lib/kv", () => ({
  redis: { getdel: mockGetdel, del: mockDel },
}));

const mockJwtVerify = vi.fn();

vi.mock("jose", () => ({
  jwtVerify: mockJwtVerify,
  SignJWT: vi.fn(),
}));

const mockHeadersGet = vi.fn();
const mockCookiesGet = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve({ get: mockHeadersGet })),
  cookies: vi.fn(() => Promise.resolve({ get: mockCookiesGet })),
}));

describe("verifyMagicToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test(`returns null when token does not exist in Redis (expired)`, async () => {
    // given
    mockGetdel.mockResolvedValue(null);
    const { verifyMagicToken } = await import("@/lib/auth");

    // when
    const result = await verifyMagicToken("expired-token");

    // then
    expect(result).toBeNull();
    expect(mockGetdel).toHaveBeenCalledWith("magic:expired-token");
  });

  test(`returns email and consumes token on first call, returns null on second call (single-use)`, async () => {
    // given
    mockGetdel.mockResolvedValueOnce("user@example.com").mockResolvedValueOnce(null);
    mockDel.mockResolvedValue(undefined);
    const { verifyMagicToken } = await import("@/lib/auth");

    // when
    const first = await verifyMagicToken("valid-token");
    const second = await verifyMagicToken("valid-token");

    // then
    expect(first).toBe("user@example.com");
    expect(second).toBeNull();
    expect(mockDel).toHaveBeenCalledWith("magic-email:user@example.com");
  });
});

describe("verifySession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test(`returns null when no token in headers or cookies`, async () => {
    // given
    mockHeadersGet.mockReturnValue(null);
    mockCookiesGet.mockReturnValue(undefined);
    const { verifySession } = await import("@/lib/auth");

    // when
    const result = await verifySession();

    // then
    expect(result).toBeNull();
  });

  test(`returns null when jwtVerify throws (expired JWT)`, async () => {
    // given
    mockHeadersGet.mockReturnValue("Bearer expired-jwt-token");
    mockJwtVerify.mockRejectedValue(new Error("expired"));
    const { verifySession } = await import("@/lib/auth");

    // when
    const result = await verifySession();

    // then
    expect(result).toBeNull();
  });

  test(`returns null when jwtVerify throws (malformed token)`, async () => {
    // given
    mockHeadersGet.mockReturnValue("Bearer not-a-jwt");
    mockJwtVerify.mockRejectedValue(new Error("invalid compact JWS"));
    const { verifySession } = await import("@/lib/auth");

    // when
    const result = await verifySession();

    // then
    expect(result).toBeNull();
  });

  test(`returns email from valid JWT payload`, async () => {
    // given
    mockHeadersGet.mockReturnValue("Bearer valid-jwt-token");
    mockJwtVerify.mockResolvedValue({ payload: { email: "user@example.com" } });
    const { verifySession } = await import("@/lib/auth");

    // when
    const result = await verifySession();

    // then
    expect(result).toBe("user@example.com");
  });

  test(`reads token from cookie when no Authorization header`, async () => {
    // given
    mockHeadersGet.mockReturnValue(null);
    mockCookiesGet.mockReturnValue({ value: "cookie-jwt-token" });
    mockJwtVerify.mockResolvedValue({ payload: { email: "cookie@example.com" } });
    const { verifySession } = await import("@/lib/auth");

    // when
    const result = await verifySession();

    // then
    expect(result).toBe("cookie@example.com");
  });
});
