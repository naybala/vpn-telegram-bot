/**
 * tests/referral.test.js
 *
 * Unit tests for handlers/referral.js
 * All DB calls are mocked — no real DB connection required.
 */

// ── Mock dependencies ─────────────────────────────────────────────
jest.mock("../db");
jest.mock("../config", () => ({
  CREDIT_VALUE: 500,
}));

const db = require("../db");
const {
  ensureUser,
  getReferralInfo,
  validateReferralCode,
  registerReferral,
  awardCredit,
  deductCredits,
  isFirstTimeBuyer,
} = require("../handlers/referral");

// Reset mock between tests
beforeEach(() => {
  db.execute.mockReset();
});

// ══════════════════════════════════════════════════════════════════
// ensureUser
// ══════════════════════════════════════════════════════════════════
describe("ensureUser()", () => {
  test("does nothing if user already exists", async () => {
    db.execute.mockResolvedValueOnce([[{ id: 1 }]]); // user found
    await ensureUser("123456", "Alice");
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  test("creates a new user when not found (no code clash)", async () => {
    db.execute
      .mockResolvedValueOnce([[]]) // user not found
      .mockResolvedValueOnce([[]]) // code not clashing
      .mockResolvedValueOnce([[]]); // INSERT
    await ensureUser("123456", "Bob");
    expect(db.execute).toHaveBeenCalledTimes(3);
    const insertCall = db.execute.mock.calls[2];
    expect(insertCall[0]).toMatch(/INSERT INTO users/);
    expect(insertCall[1][0]).toBe("123456");
    expect(insertCall[1][1]).toBe("Bob");
  });

  test("retries code generation on referral_code collision", async () => {
    db.execute
      .mockResolvedValueOnce([[]]) // user not found
      .mockResolvedValueOnce([[{ id: 99 }]]) // first code CLASHES
      .mockResolvedValueOnce([[]]); // INSERT succeeds
    await ensureUser("999", "Charlie");
    expect(db.execute).toHaveBeenCalledTimes(3);
  });
});

// ══════════════════════════════════════════════════════════════════
// getReferralInfo
// ══════════════════════════════════════════════════════════════════
describe("getReferralInfo()", () => {
  test("returns referral_code and credits for an existing user", async () => {
    db.execute.mockResolvedValueOnce([[{ referral_code: "USR_1234AB", credits: 3 }]]);
    const info = await getReferralInfo("9999");
    expect(info).toEqual({ referral_code: "USR_1234AB", credits: 3 });
  });

  test("returns null for a non-existent user", async () => {
    db.execute.mockResolvedValueOnce([[]]);
    const info = await getReferralInfo("0000");
    expect(info).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// validateReferralCode
// ══════════════════════════════════════════════════════════════════
describe("validateReferralCode()", () => {
  test("returns not_found when code does not exist", async () => {
    db.execute.mockResolvedValueOnce([[]]); // code not found
    const result = await validateReferralCode("BAD_CODE", "111");
    expect(result).toEqual({ valid: false, reason: "not_found" });
  });

  test("returns own_code when user tries their own code", async () => {
    db.execute.mockResolvedValueOnce([[{ telegram_id: "111" }]]); // code belongs to user 111
    const result = await validateReferralCode("USR_1234AB", "111");
    expect(result).toEqual({ valid: false, reason: "own_code" });
  });

  test("returns already_used when user was already referred", async () => {
    db.execute
      .mockResolvedValueOnce([[{ telegram_id: "222" }]]) // code found, belongs to 222
      .mockResolvedValueOnce([[{ id: 5 }]]); // referred_id already exists
    const result = await validateReferralCode("USR_1234AB", "111");
    expect(result).toEqual({ valid: false, reason: "already_used" });
  });

  test("returns valid: true and referrerId for a valid code", async () => {
    db.execute
      .mockResolvedValueOnce([[{ telegram_id: "222" }]]) // code found, belongs to 222
      .mockResolvedValueOnce([[]]); // no existing referral for user 111
    const result = await validateReferralCode("USR_1234AB", "111");
    expect(result).toEqual({ valid: true, referrerId: "222" });
  });

  test("normalises code to uppercase", async () => {
    db.execute
      .mockResolvedValueOnce([[{ telegram_id: "222" }]])
      .mockResolvedValueOnce([[]]);
    await validateReferralCode("usr_1234ab", "111");
    // First arg to first call should be SELECT with UPPER version
    expect(db.execute.mock.calls[0][1][0]).toBe("USR_1234AB");
  });
});

// ══════════════════════════════════════════════════════════════════
// registerReferral
// ══════════════════════════════════════════════════════════════════
describe("registerReferral()", () => {
  test("inserts a referral record with credited = 0", async () => {
    db.execute.mockResolvedValueOnce([[]]);
    await registerReferral("222", "111", "USR_1234AB");
    const [sql, params] = db.execute.mock.calls[0];
    expect(sql).toMatch(/INSERT IGNORE INTO referrals/);
    expect(params).toEqual(["222", "111", "USR_1234AB"]);
  });
});

// ══════════════════════════════════════════════════════════════════
// awardCredit
// ══════════════════════════════════════════════════════════════════
describe("awardCredit()", () => {
  test("marks referral as credited, increments credit, notifies referrer", async () => {
    db.execute
      .mockResolvedValueOnce([[]])  // UPDATE referrals
      .mockResolvedValueOnce([[]])  // UPDATE users credits
      .mockResolvedValueOnce([[{ credits: 2 }]]); // SELECT new total

    const telegram = { sendMessage: jest.fn().mockResolvedValue(true) };
    await awardCredit("222", telegram);

    expect(db.execute.mock.calls[0][0]).toMatch(/UPDATE referrals SET credited = 1/);
    expect(db.execute.mock.calls[1][0]).toMatch(/UPDATE users SET credits = credits \+ 1/);
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      "222",
      expect.stringContaining("+1 Credit"),
      expect.any(Object)
    );
  });

  test("continues silently if telegram notification fails", async () => {
    db.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ credits: 1 }]]);
    const telegram = { sendMessage: jest.fn().mockRejectedValue(new Error("network")) };
    await expect(awardCredit("222", telegram)).resolves.not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════
// deductCredits
// ══════════════════════════════════════════════════════════════════
describe("deductCredits()", () => {
  test("deducts the given amount from user credits", async () => {
    db.execute.mockResolvedValueOnce([[]]);
    await deductCredits("111", 2);
    const [sql, params] = db.execute.mock.calls[0];
    expect(sql).toMatch(/GREATEST\(0, credits - \?\)/);
    expect(params).toEqual([2, "111"]);
  });

  test("does nothing when amount is 0", async () => {
    await deductCredits("111", 0);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("does nothing when amount is negative", async () => {
    await deductCredits("111", -5);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("does nothing when amount is null/undefined", async () => {
    await deductCredits("111", null);
    expect(db.execute).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════
// isFirstTimeBuyer
// ══════════════════════════════════════════════════════════════════
describe("isFirstTimeBuyer()", () => {
  test("returns false if user already has a key", async () => {
    db.execute.mockResolvedValueOnce([[{ id: 10 }]]); // has a key
    const result = await isFirstTimeBuyer("111");
    expect(result).toBe(false);
  });

  test("returns false if user has been referred before", async () => {
    db.execute
      .mockResolvedValueOnce([[]]) // no keys
      .mockResolvedValueOnce([[{ id: 5 }]]); // has referral record
    const result = await isFirstTimeBuyer("111");
    expect(result).toBe(false);
  });

  test("returns true for a brand new user with no keys and no referral", async () => {
    db.execute
      .mockResolvedValueOnce([[]]) // no keys
      .mockResolvedValueOnce([[]]); // no referral
    const result = await isFirstTimeBuyer("111");
    expect(result).toBe(true);
  });
});
