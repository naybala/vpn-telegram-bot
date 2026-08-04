/**
 * tests/userLimit.test.js
 *
 * Tests for the USER_LIMIT / server capacity logic.
 * Tests the pure logic of isFull() determination and button label generation.
 */

// ══════════════════════════════════════════════════════════════════
// Pure helper logic (extracted from routes/index.js)
// ══════════════════════════════════════════════════════════════════

function isServerFull(activeCount, userLimit) {
  return userLimit > 0 && activeCount >= userLimit;
}

function buildServerButtonLabel(serverName, price, activeCount, userLimit) {
  const full = isServerFull(activeCount, userLimit);
  return full
    ? `🌐 ${serverName} — ${price} (Full)`
    : `🌐 ${serverName} — ${price}`;
}

function buildServerListLine(index, serverName, price, limitGb, activeCount, userLimit) {
  const full = isServerFull(activeCount, userLimit);
  const statusText = full ? " *(Full)*" : "";
  return `${index + 1}. **${serverName}** — ${price} / ${limitGb}GB${statusText}`;
}

// ══════════════════════════════════════════════════════════════════
// isServerFull
// ══════════════════════════════════════════════════════════════════
describe("isServerFull()", () => {
  test("returns false when USER_LIMIT is 0 (unlimited), even if count is high", () => {
    expect(isServerFull(1000, 0)).toBe(false);
  });

  test("returns false when count is below the limit", () => {
    expect(isServerFull(4, 5)).toBe(false);
  });

  test("returns true when count equals the limit", () => {
    expect(isServerFull(5, 5)).toBe(true);
  });

  test("returns true when count exceeds the limit", () => {
    expect(isServerFull(20, 5)).toBe(true);
  });

  test("returns false when count is 0 and limit is 15", () => {
    expect(isServerFull(0, 15)).toBe(false);
  });

  test("returns false when limit is 1 and count is 0", () => {
    expect(isServerFull(0, 1)).toBe(false);
  });

  test("returns true when limit is 1 and count is 1", () => {
    expect(isServerFull(1, 1)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Server button label
// ══════════════════════════════════════════════════════════════════
describe("buildServerButtonLabel()", () => {
  test("shows normal label when server is not full", () => {
    const label = buildServerButtonLabel("Thailand", "7000 Ks", 4, 15);
    expect(label).toBe("🌐 Thailand — 7000 Ks");
  });

  test("shows (Full) label when server is at capacity", () => {
    const label = buildServerButtonLabel("Thailand", "7000 Ks", 15, 15);
    expect(label).toBe("🌐 Thailand — 7000 Ks (Full)");
  });

  test("shows (Full) label when server is over capacity", () => {
    const label = buildServerButtonLabel("Singapore", "7000 Ks", 20, 15);
    expect(label).toBe("🌐 Singapore — 7000 Ks (Full)");
  });

  test("shows normal label when limit is 0 (unlimited) regardless of count", () => {
    const label = buildServerButtonLabel("Thailand", "7000 Ks", 999, 0);
    expect(label).toBe("🌐 Thailand — 7000 Ks");
  });
});

// ══════════════════════════════════════════════════════════════════
// Server list text (message body)
// ══════════════════════════════════════════════════════════════════
describe("buildServerListLine()", () => {
  test("does NOT include *(Full)* when server has capacity", () => {
    const line = buildServerListLine(0, "Thailand", "7000 Ks", 100, 4, 15);
    expect(line).not.toContain("Full");
    expect(line).toBe("1. **Thailand** — 7000 Ks / 100GB");
  });

  test("includes *(Full)* when server is at capacity", () => {
    const line = buildServerListLine(0, "Thailand", "7000 Ks", 100, 15, 15);
    expect(line).toContain("*(Full)*");
  });

  test("includes *(Full)* when server is over capacity", () => {
    const line = buildServerListLine(1, "Singapore", "7000 Ks", 100, 99, 15);
    expect(line).toContain("*(Full)*");
    expect(line).toContain("2. **Singapore**");
  });
});
