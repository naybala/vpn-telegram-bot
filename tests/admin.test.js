/**
 * tests/admin.test.js
 *
 * Unit tests for handlers/admin.js — executeGenerateKey()
 * All external dependencies (DB, Outline API, Telegram) are mocked.
 */

// ── Mock dependencies ─────────────────────────────────────────────
jest.mock("../db");
jest.mock("../bot", () => ({
  getClient: jest.fn(),
}));
jest.mock("../config", () => ({
  ADMIN_ID: 9999,
  SERVERS: [
    { id: 0, name: "Thailand", apiUrl: "https://th.example.com", dns: null, price: "7000 Ks" },
    { id: 1, name: "Singapore", apiUrl: "https://sg.example.com", dns: "sg.vpn.example.com", price: "7000 Ks" },
  ],
  DEFAULT_LIMIT_GB: 100,
  PLAN_DAYS: 30,
}));
jest.mock("../handlers/referral", () => ({
  awardCredit: jest.fn().mockResolvedValue(undefined),
  deductCredits: jest.fn().mockResolvedValue(undefined),
}));

const db = require("../db");
const { getClient } = require("../bot");
const { awardCredit, deductCredits } = require("../handlers/referral");
const { executeGenerateKey } = require("../handlers/admin");

// Reusable mock Outline API client
function makeClient({ keyId = "k1", accessUrl = "ss://abc@1.2.3.4:8388" } = {}) {
  return {
    post: jest.fn().mockResolvedValue({ data: { id: keyId, accessUrl } }),
    put: jest.fn().mockResolvedValue({}),
  };
}

// Reusable mock telegram object
function makeTelegram() {
  return { sendMessage: jest.fn().mockResolvedValue(true) };
}

beforeEach(() => {
  db.execute.mockReset();
  awardCredit.mockClear();
  deductCredits.mockClear();
  getClient.mockReset();
});

// ══════════════════════════════════════════════════════════════════
// executeGenerateKey
// ══════════════════════════════════════════════════════════════════
describe("executeGenerateKey()", () => {
  test("throws when serverIndex is out of range", async () => {
    const telegram = makeTelegram();
    await expect(
      executeGenerateKey({ targetUserId: "111", serverIndex: 99, telegram })
    ).rejects.toThrow("Invalid server index: 99");
  });

  test("creates key, saves to DB, and messages user", async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[]]) // INSERT user_keys
      .mockResolvedValueOnce([[]]); // SELECT referrals (no referral)
    const telegram = makeTelegram();

    const result = await executeGenerateKey({
      targetUserId: "111",
      serverIndex: 0,
      telegram,
    });

    expect(client.post).toHaveBeenCalledWith("/access-keys");
    expect(client.put).toHaveBeenCalledWith("/access-keys/k1/name", expect.any(Object));
    expect(client.put).toHaveBeenCalledWith("/access-keys/k1/data-limit", expect.any(Object));
    expect(db.execute).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO user_keys/), expect.any(Array));
    expect(telegram.sendMessage).toHaveBeenCalledWith("111", expect.stringContaining("Payment Accepted"), expect.any(Object));
    expect(result.serverName).toBe("Thailand");
    expect(result).toHaveProperty("expiresDisplay");
    expect(result).toHaveProperty("uniqueName");
  });

  test("applies DNS swap when server has a dns hostname", async () => {
    const client = makeClient({ accessUrl: "ss://abc@5.6.7.8:8388" });
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    await executeGenerateKey({ targetUserId: "111", serverIndex: 1, telegram });

    const sendCall = telegram.sendMessage.mock.calls[0][1];
    expect(sendCall).toContain("sg.vpn.example.com");
    expect(sendCall).not.toContain("5.6.7.8");
  });

  test("deducts credits when creditsToUse > 0", async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    await executeGenerateKey({ targetUserId: "111", serverIndex: 0, creditsToUse: 2, telegram });

    expect(deductCredits).toHaveBeenCalledWith("111", 2);
  });

  test("does NOT deduct credits when creditsToUse is 0", async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    await executeGenerateKey({ targetUserId: "111", serverIndex: 0, creditsToUse: 0, telegram });

    expect(deductCredits).not.toHaveBeenCalled();
  });

  test("awards referral credit when a pending referral exists", async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[]])          // INSERT user_keys
      .mockResolvedValueOnce([[{ referrer_id: "222", referred_id: "111", credited: 0 }]]); // referral found
    const telegram = makeTelegram();

    await executeGenerateKey({ targetUserId: "111", serverIndex: 0, telegram });

    expect(awardCredit).toHaveBeenCalledWith("222", telegram);
  });

  test("does NOT award credit when no pending referral", async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[]])  // INSERT
      .mockResolvedValueOnce([[]]); // no referral rows
    const telegram = makeTelegram();

    await executeGenerateKey({ targetUserId: "111", serverIndex: 0, telegram });

    expect(awardCredit).not.toHaveBeenCalled();
  });

  test("data limit set to DEFAULT_LIMIT_GB * 1000^3 bytes", async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);
    db.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    const telegram = makeTelegram();

    await executeGenerateKey({ targetUserId: "111", serverIndex: 0, telegram });

    const dataLimitCall = client.put.mock.calls.find((c) => c[0].includes("data-limit"));
    expect(dataLimitCall[1]).toEqual({ limit: { bytes: 100 * 1000 ** 3 } });
  });
});
