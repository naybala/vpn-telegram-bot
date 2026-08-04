// __mocks__/db.js
// Shared mock for the MySQL db module.
// moduleNameMapper in package.json routes all db imports here.
// This prevents the real db/index.js from ever running (which would open a MySQL pool).

const mockExecute = jest.fn();

const db = {
  execute: mockExecute,
};

module.exports = db;
