/**
 * tests/credit.test.js
 *
 * Tests the credit discount calculation logic used in routes/index.js
 * when a user specifies how many credits to use.
 *
 * These are pure function tests — no Telegram, DB, or bot required.
 */

// ── The calculation logic (extracted from routes/index.js) ────────
const CREDIT_VALUE = 500; // 500 Ks per credit

function calculateDiscount(serverPrice, creditsToUse) {
  const origPriceNum = parseInt(serverPrice.replace(/[^\d]/g, ""), 10);
  const discountNum = creditsToUse * CREDIT_VALUE;
  const finalPriceNum = Math.max(0, origPriceNum - discountNum);
  return { origPriceNum, discountNum, finalPriceNum };
}

// ══════════════════════════════════════════════════════════════════
// Credit discount calculation
// ══════════════════════════════════════════════════════════════════
describe("Credit discount calculation", () => {
  test("1 credit gives 500 Ks off a 7000 Ks plan → 6500 Ks", () => {
    const { origPriceNum, discountNum, finalPriceNum } = calculateDiscount("7000 Ks", 1);
    expect(origPriceNum).toBe(7000);
    expect(discountNum).toBe(500);
    expect(finalPriceNum).toBe(6500);
  });

  test("2 credits gives 1000 Ks off a 7000 Ks plan → 6000 Ks", () => {
    const { finalPriceNum } = calculateDiscount("7000 Ks", 2);
    expect(finalPriceNum).toBe(6000);
  });

  test("14 credits (7000 Ks) makes the plan fully free → 0 Ks", () => {
    const { finalPriceNum } = calculateDiscount("7000 Ks", 14);
    expect(finalPriceNum).toBe(0);
  });

  test("excess credits never produce a negative price → clamped to 0", () => {
    const { finalPriceNum } = calculateDiscount("7000 Ks", 100);
    expect(finalPriceNum).toBe(0);
  });

  test("0 credits means no discount → original price", () => {
    const { finalPriceNum } = calculateDiscount("7000 Ks", 0);
    expect(finalPriceNum).toBe(7000);
  });

  test("works with prices that have commas or other non-digit chars", () => {
    const { origPriceNum } = calculateDiscount("10,000 Ks", 1);
    expect(origPriceNum).toBe(10000);
  });

  test("1 credit off a 10000 Ks plan → 9500 Ks", () => {
    const { finalPriceNum } = calculateDiscount("10000 Ks", 1);
    expect(finalPriceNum).toBe(9500);
  });
});

// ══════════════════════════════════════════════════════════════════
// Credit input validation rules (matches routes/index.js logic)
// ══════════════════════════════════════════════════════════════════
describe("Credit input validation", () => {
  function validateCreditInput(input, userCredits) {
    const amount = parseInt(input, 10);
    if (isNaN(amount) || amount < 1) return { valid: false, reason: "invalid_number" };
    if (amount > userCredits) return { valid: false, reason: "exceeds_balance" };
    return { valid: true, amount };
  }

  test("rejects non-numeric input", () => {
    expect(validateCreditInput("abc", 5)).toEqual({ valid: false, reason: "invalid_number" });
  });

  test("rejects zero", () => {
    expect(validateCreditInput("0", 5)).toEqual({ valid: false, reason: "invalid_number" });
  });

  test("rejects negative numbers", () => {
    expect(validateCreditInput("-1", 5)).toEqual({ valid: false, reason: "invalid_number" });
  });

  test("rejects amount greater than user's balance", () => {
    expect(validateCreditInput("6", 5)).toEqual({ valid: false, reason: "exceeds_balance" });
  });

  test("accepts valid amount equal to balance", () => {
    expect(validateCreditInput("5", 5)).toEqual({ valid: true, amount: 5 });
  });

  test("accepts valid amount less than balance", () => {
    expect(validateCreditInput("3", 5)).toEqual({ valid: true, amount: 3 });
  });

  test("accepts amount of 1", () => {
    expect(validateCreditInput("1", 5)).toEqual({ valid: true, amount: 1 });
  });
});

// ══════════════════════════════════════════════════════════════════
// Admin inline button callback data format
// ══════════════════════════════════════════════════════════════════
describe("Admin inline callback data format", () => {
  function buildGenCbData(userId, serverIdx, creditsToUse) {
    return creditsToUse > 0
      ? `adm_gen_${userId}_${serverIdx}_${creditsToUse}`
      : `adm_gen_${userId}_${serverIdx}`;
  }

  function buildExtCbData(userId, keyDbId, creditsToUse) {
    return creditsToUse > 0
      ? `adm_ext_${userId}_${keyDbId}_${creditsToUse}`
      : `adm_ext_${userId}_${keyDbId}`;
  }

  test("gen callback includes credits suffix when creditsToUse > 0", () => {
    expect(buildGenCbData("111", 0, 2)).toBe("adm_gen_111_0_2");
  });

  test("gen callback omits credits suffix when creditsToUse is 0", () => {
    expect(buildGenCbData("111", 0, 0)).toBe("adm_gen_111_0");
  });

  test("ext callback includes credits and keyDbId suffix when creditsToUse > 0", () => {
    expect(buildExtCbData("111", 7, 3)).toBe("adm_ext_111_7_3");
  });

  test("ext callback omits credits suffix when creditsToUse is 0", () => {
    expect(buildExtCbData("111", 7, 0)).toBe("adm_ext_111_7");
  });

  test("gen regex matches format with credits", () => {
    const re = /^adm_gen_(\d+)_(\d+)(?:_(\d+))?$/;
    const m = "adm_gen_111_0_2".match(re);
    expect(m[1]).toBe("111");
    expect(m[2]).toBe("0");
    expect(m[3]).toBe("2");
  });

  test("gen regex matches format without credits", () => {
    const re = /^adm_gen_(\d+)_(\d+)(?:_(\d+))?$/;
    const m = "adm_gen_111_0".match(re);
    expect(m[1]).toBe("111");
    expect(m[2]).toBe("0");
    expect(m[3]).toBeUndefined();
  });

  test("ext regex matches format with keyDbId and credits", () => {
    const re = /^adm_ext_(\d+)(?:_(\d+))?(?:_(\d+))?$/;
    const m = "adm_ext_111_7_3".match(re);
    expect(m[1]).toBe("111");
    expect(m[2]).toBe("7");
    expect(m[3]).toBe("3");
  });
});
