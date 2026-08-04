/**
 * tests/balance.test.js
 *
 * Unit tests for balance check helper logic.
 * Tests expiry text generation and usage bar calculation
 * (pure functions extracted from handlers/balance.js).
 */

// ══════════════════════════════════════════════════════════════════
// Expiry text generation (mirrors balance.js logic)
// ══════════════════════════════════════════════════════════════════
function getExpiryText(expiresAt) {
  if (!expiresAt) return { text: "♾️ No Expiry", daysLeft: null };
  const now = new Date();
  const daysLeft = Math.ceil((new Date(expiresAt) - now) / (1000 * 60 * 60 * 24));
  const expiresDisplay = new Date(expiresAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  if (daysLeft <= 0) return { text: "❌ Expired", daysLeft };
  if (daysLeft <= 3) return { text: `⚠️ Expires **${expiresDisplay}** (${daysLeft} day(s) left!)`, daysLeft };
  return { text: `📅 Expires **${expiresDisplay}** (${daysLeft} days left)`, daysLeft };
}

function calcDataUsage(usedBytes, limitBytes) {
  const usedGB = (usedBytes / 1000 ** 3).toFixed(2);
  const limitGB = (limitBytes / 1000 ** 3).toFixed(2);
  const leftGB = Math.max(0, (limitBytes - usedBytes) / 1000 ** 3).toFixed(2);
  const percent = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0;
  const filled = Math.floor(percent / 10);
  const bar = "▓".repeat(filled) + "░".repeat(10 - filled);
  return { usedGB, limitGB, leftGB, percent, bar };
}

describe("getExpiryText()", () => {
  test("returns No Expiry when expiresAt is null", () => {
    const { text, daysLeft } = getExpiryText(null);
    expect(text).toBe("♾️ No Expiry");
    expect(daysLeft).toBeNull();
  });

  test("returns Expired for past date", () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const { text } = getExpiryText(past);
    expect(text).toBe("❌ Expired");
  });

  test("returns warning emoji for 1 day left", () => {
    const soon = new Date(Date.now() + 20 * 60 * 60 * 1000); // ~20 hrs
    const { text } = getExpiryText(soon);
    expect(text).toContain("⚠️");
    expect(text).toContain("day(s) left!");
  });

  test("returns warning for exactly 3 days left", () => {
    const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 - 60000);
    const { text } = getExpiryText(threeDays);
    expect(text).toContain("⚠️");
  });

  test("returns normal expiry emoji for 10 days left", () => {
    const tenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const { text } = getExpiryText(tenDays);
    expect(text).toContain("📅");
    expect(text).toContain("days left");
  });
});

// ══════════════════════════════════════════════════════════════════
// Data usage calculation
// ══════════════════════════════════════════════════════════════════
describe("calcDataUsage()", () => {
  const GB = 1000 ** 3;

  test("0 GB used → 100% left, 0% bar", () => {
    const { usedGB, leftGB, percent, bar } = calcDataUsage(0, 100 * GB);
    expect(usedGB).toBe("0.00");
    expect(leftGB).toBe("100.00");
    expect(percent).toBe(0);
    expect(bar).toBe("░".repeat(10));
  });

  test("50 GB used of 100 GB → 50%", () => {
    const { percent, bar } = calcDataUsage(50 * GB, 100 * GB);
    expect(percent).toBe(50);
    expect(bar).toBe("▓▓▓▓▓░░░░░");
  });

  test("100 GB used of 100 GB → 100%, full bar", () => {
    const { percent, bar } = calcDataUsage(100 * GB, 100 * GB);
    expect(percent).toBe(100);
    expect(bar).toBe("▓".repeat(10));
  });

  test("usage exceeding limit is clamped to 100%", () => {
    const { percent, leftGB } = calcDataUsage(200 * GB, 100 * GB);
    expect(percent).toBe(100);
    expect(leftGB).toBe("0.00");
  });

  test("leftGB is 0 when usedBytes > limitBytes (no negative)", () => {
    const { leftGB } = calcDataUsage(110 * GB, 100 * GB);
    expect(leftGB).toBe("0.00");
  });

  test("percent is 0 when limitBytes is 0 (no-limit key)", () => {
    const { percent } = calcDataUsage(50 * GB, 0);
    expect(percent).toBe(0);
  });
});
