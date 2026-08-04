/**
 * tests/extend.test.js
 *
 * Unit tests for handlers/extend.js — executeExtendKey()
 * All external dependencies (DB, Outline API, Telegram) are mocked.
 */

// ── Mock dependencies ─────────────────────────────────────────────
jest.mock("../db");
jest.mock("../bot", () => ({
  getClient: jest.fn(),
}));
jest.mock("../config", () => ({
  ADMIN_ID: 9999,
  PLAN_DAYS: 30,
  DEFAULT_LIMIT_GB: 100,
  SERVERS: [
    { id: 0, name: "Thailand", apiUrl: "https://th.example.com" },
    { id: 1, name: "Singapore", apiUrl: "https://sg.example.com" },
  ],
}));
jest.mock("../handlers/referral", () => ({
  deductCredits: jest.fn().mockResolvedValue(undefined),
}));

const db = require("../db");
const { getClient } = require("../bot");
const { deductCredits } = require("../handlers/referral");
const { executeExtendKey } = require("../handlers/extend");

// Helper: build a fake DB key row
function fakeKey({ id = 1, key_id = "k1", server_index = 0, expires_at = null } = {}) {
  const exp = expires_at || new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
  return { id, key_id, server_index, expires_at: exp, telegram_id: "111" };
}

// Helper: build a mock Outline API client
function makeClient({ currentBytes = 100 * 1000 ** 3 } = {}) {
  return {
    get: jest.fn().mockResolvedValue({
      data: {
        accessKeys: [{ id: "k1", dataLimit: { bytes: currentBytes } }],
      },
    }),
    put: jest.fn().mockResolvedValue({}),
  };
}

function makeTelegram() {
  return { sendMessage: jest.fn().mockResolvedValue(true) };
}

beforeEach(() => {
  db.execute.mockReset();
  deductCredits.mockClear();
  getClient.mockReset();
});

// ══════════════════════════════════════════════════════════════════
// executeExtendKey
// ══════════════════════════════════════════════════════════════════
describe("executeExtendKey()", () => {
  test("throws when user has no matching key", async () => {
    db.execute.mockResolvedValueOnce([[]]); // no key found
    const telegram = makeTelegram();
    await expect(
      executeExtendKey({ targetUserId: "111", telegram })
    ).rejects.toThrow("has no matching key");
  });

  test("extends expiry date by daysToAdd", async () => {
    const key = fakeKey();
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[key]])  // SELECT key
      .mockResolvedValueOnce([[]]); // UPDATE expires_at
    const telegram = makeTelegram();

    const result = await executeExtendKey({ targetUserId: "111", daysToAdd: 30, telegram });

    expect(result.daysToAdd).toBe(30);
    expect(result).toHaveProperty("newExpiryDisplay");
    expect(result).toHaveProperty("serverName", "Thailand");
  });

  test("adds DEFAULT_LIMIT_GB (100GB) to existing data limit via Outline API", async () => {
    const key = fakeKey();
    const client = makeClient({ currentBytes: 100 * 1000 ** 3 });
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[key]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    const result = await executeExtendKey({ targetUserId: "111", daysToAdd: 30, telegram });

    // Should have called PUT with currentBytes + 100GB
    const putCall = client.put.mock.calls.find((c) => c[0].includes("data-limit"));
    expect(putCall[1]).toEqual({ limit: { bytes: 200 * 1000 ** 3 } });
    expect(result.newLimitGb).toBe(200);
  });

  test("uses DEFAULT_LIMIT_GB as fallback when key has no dataLimit", async () => {
    const key = fakeKey();
    const client = {
      get: jest.fn().mockResolvedValue({
        data: { accessKeys: [{ id: "k1" }] }, // no dataLimit
      }),
      put: jest.fn().mockResolvedValue({}),
    };
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[key]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    const result = await executeExtendKey({ targetUserId: "111", daysToAdd: 30, telegram });

    const putCall = client.put.mock.calls.find((c) => c[0].includes("data-limit"));
    // Fallback: DEFAULT_LIMIT_GB * 1000^3 + DEFAULT_LIMIT_GB * 1000^3 = 200GB
    expect(putCall[1]).toEqual({ limit: { bytes: 200 * 1000 ** 3 } });
  });

  test("still extends expiry even if Outline API is unreachable", async () => {
    const key = fakeKey();
    const client = {
      get: jest.fn().mockRejectedValue(new Error("timeout")),
      put: jest.fn(),
    };
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[key]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    // Should not throw even when Outline API fails
    const result = await executeExtendKey({ targetUserId: "111", daysToAdd: 30, telegram });
    expect(result).toHaveProperty("daysToAdd", 30);
    expect(telegram.sendMessage).toHaveBeenCalled();
  });

  test("selects most recent active key when no keyDbId given", async () => {
    const key = fakeKey();
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[key]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    await executeExtendKey({ targetUserId: "111", telegram });

    // First call should SELECT without id constraint
    const [sql] = db.execute.mock.calls[0];
    expect(sql).not.toMatch(/WHERE id = \?/);
    expect(sql).toMatch(/ORDER BY created_at DESC/);
  });

  test("selects specific key when keyDbId is given", async () => {
    const key = fakeKey({ id: 7 });
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[key]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    await executeExtendKey({ targetUserId: "111", keyDbId: 7, telegram });

    const [sql, params] = db.execute.mock.calls[0];
    // With keyDbId, it queries by id AND telegram_id
    expect(sql).toMatch(/WHERE id = \? AND telegram_id = \?/);
    expect(params[0]).toBe(7);
  });

  test("deducts credits when creditsToUse > 0", async () => {
    const key = fakeKey();
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[key]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    await executeExtendKey({ targetUserId: "111", daysToAdd: 30, creditsToUse: 3, telegram });

    expect(deductCredits).toHaveBeenCalledWith("111", 3);
  });

  test("does NOT deduct credits when creditsToUse is 0", async () => {
    const key = fakeKey();
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[key]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    await executeExtendKey({ targetUserId: "111", daysToAdd: 30, creditsToUse: 0, telegram });

    expect(deductCredits).not.toHaveBeenCalled();
  });

  test("uses today as base date when key is already expired", async () => {
    const pastExpiry = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const key = fakeKey({ expires_at: pastExpiry });
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[key]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    const before = new Date();
    const result = await executeExtendKey({ targetUserId: "111", daysToAdd: 30, telegram });
    const after = new Date();

    // New expiry should be ~30 days from NOW, not from the past expiry
    const expectedMin = new Date(before);
    expectedMin.setDate(expectedMin.getDate() + 29);
    const expectedMax = new Date(after);
    expectedMax.setDate(expectedMax.getDate() + 31);
    expect(result).toHaveProperty("newExpiryDisplay");
  });
});
