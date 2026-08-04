/**
 * Mock DB — replaces ../db in all tests.
 * Each test file can customise mockExecute.returnValue / implementation.
 */
const mockExecute = jest.fn();

const db = {
  execute: mockExecute,
};

module.exports = db;
