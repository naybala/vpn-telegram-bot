/**
 * tests/config.test.js
 *
 * Tests config/index.js parsing:
 * - SERVERS built correctly from env vars
 * - PAYMENT_METHODS included only when env vars are present
 * - USER_LIMIT, CREDIT_VALUE, PLAN_DAYS defaults
 *
 * NOTE: We mock dotenv and db to avoid real .env loading and DB connections.
 */

// Mock dotenv so it doesn't load the real .env file during tests
jest.mock("dotenv", () => ({ config: jest.fn() }));

// Mock db to prevent real DB connection
jest.mock("../db", () => ({}));

// Store real env, restore after all tests
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    BOT_TOKEN: "test:token",
    USER_ID: "9999",
    GROUP_ID: "-1001234567",
    DB_HOST: "localhost",
    API_URLS: "https://th.example.com,https://sg.example.com",
    SERVER_NAMES: "Thailand,Singapore",
    SERVER_PRICES: "7000 Ks,8000 Ks",
    DNS_HOSTNAMES: ",sg.vpn.example.com",
  };
});

afterAll(() => {
  process.env = originalEnv;
});

// ══════════════════════════════════════════════════════════════════
// SERVERS
// ══════════════════════════════════════════════════════════════════
describe("Config — SERVERS", () => {
  test("builds correct number of servers from API_URLS", () => {
    const { SERVERS } = require("../config");
    expect(SERVERS).toHaveLength(2);
  });

  test("assigns correct names from SERVER_NAMES", () => {
    const { SERVERS } = require("../config");
    expect(SERVERS[0].name).toBe("Thailand");
    expect(SERVERS[1].name).toBe("Singapore");
  });

  test("assigns correct prices from SERVER_PRICES", () => {
    const { SERVERS } = require("../config");
    expect(SERVERS[0].price).toBe("7000 Ks");
    expect(SERVERS[1].price).toBe("8000 Ks");
  });

  test("assigns dns from DNS_HOSTNAMES (empty slot = null)", () => {
    const { SERVERS } = require("../config");
    expect(SERVERS[0].dns).toBeNull();
    expect(SERVERS[1].dns).toBe("sg.vpn.example.com");
  });

  test("falls back to 'Server #N' when SERVER_NAMES slot is empty", () => {
    process.env.SERVER_NAMES = ",";
    const { SERVERS } = require("../config");
    expect(SERVERS[0].name).toBe("Server #1");
  });

  test("falls back to '7000 Ks' when SERVER_PRICES slot is empty", () => {
    process.env.SERVER_PRICES = ",";
    const { SERVERS } = require("../config");
    expect(SERVERS[0].price).toBe("7000 Ks");
  });
});

// ══════════════════════════════════════════════════════════════════
// PAYMENT_METHODS
// ══════════════════════════════════════════════════════════════════
describe("Config — PAYMENT_METHODS", () => {
  test("includes KPay when KPAY_PHONE_NUMBER is set", () => {
    process.env.KPAY_PHONE_NUMBER = "09111111111";
    const { PAYMENT_METHODS } = require("../config");
    expect(PAYMENT_METHODS.some((m) => m.key === "kpay")).toBe(true);
  });

  test("excludes KPay when KPAY_PHONE_NUMBER is not set", () => {
    delete process.env.KPAY_PHONE_NUMBER;
    const { PAYMENT_METHODS } = require("../config");
    expect(PAYMENT_METHODS.some((m) => m.key === "kpay")).toBe(false);
  });

  test("includes AyaPay when AYAPAY_PHONE_NUMBER is set", () => {
    process.env.AYAPAY_PHONE_NUMBER = "09222222222";
    const { PAYMENT_METHODS } = require("../config");
    expect(PAYMENT_METHODS.some((m) => m.key === "ayapay")).toBe(true);
  });

  test("includes CBPay when CBPAY_PHONE_NUMBER is set", () => {
    process.env.CBPAY_PHONE_NUMBER = "09333333333";
    const { PAYMENT_METHODS } = require("../config");
    expect(PAYMENT_METHODS.some((m) => m.key === "cbpay")).toBe(true);
  });

  test("KPay label includes phone and owner", () => {
    process.env.KPAY_PHONE_NUMBER = "09111111111";
    process.env.KPAY_OWNER = "Alice";
    const { PAYMENT_METHODS } = require("../config");
    const kpay = PAYMENT_METHODS.find((m) => m.key === "kpay");
    expect(kpay.phone).toBe("09111111111");
    expect(kpay.owner).toBe("Alice");
  });
});

// ══════════════════════════════════════════════════════════════════
// Scalar values
// ══════════════════════════════════════════════════════════════════
describe("Config — scalar values", () => {
  test("PLAN_DAYS defaults to 30 when not set", () => {
    delete process.env.PLAN_DAYS;
    const { PLAN_DAYS } = require("../config");
    expect(PLAN_DAYS).toBe(30);
  });

  test("PLAN_DAYS reads from env", () => {
    process.env.PLAN_DAYS = "60";
    const { PLAN_DAYS } = require("../config");
    expect(PLAN_DAYS).toBe(60);
  });

  test("CREDIT_VALUE defaults to 500 when not set", () => {
    delete process.env.CREDIT_VALUE;
    const { CREDIT_VALUE } = require("../config");
    expect(CREDIT_VALUE).toBe(500);
  });

  test("CREDIT_VALUE reads from env", () => {
    process.env.CREDIT_VALUE = "1000";
    const { CREDIT_VALUE } = require("../config");
    expect(CREDIT_VALUE).toBe(1000);
  });

  test("USER_LIMIT defaults to 0 (unlimited) when not set", () => {
    delete process.env.USER_LIMIT;
    const { USER_LIMIT } = require("../config");
    expect(USER_LIMIT).toBe(0);
  });

  test("USER_LIMIT reads from env", () => {
    process.env.USER_LIMIT = "15";
    const { USER_LIMIT } = require("../config");
    expect(USER_LIMIT).toBe(15);
  });

  test("DEFAULT_LIMIT_GB is always 100", () => {
    const { DEFAULT_LIMIT_GB } = require("../config");
    expect(DEFAULT_LIMIT_GB).toBe(100);
  });

  test("ADMIN_ID is a Number parsed from USER_ID env", () => {
    process.env.USER_ID = "9999";
    const { ADMIN_ID } = require("../config");
    expect(typeof ADMIN_ID).toBe("number");
    expect(ADMIN_ID).toBe(9999);
  });
});
