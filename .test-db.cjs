const { DatabaseSync } = require('node:sqlite');
module.exports = function database() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  const prepare = (sql, args = []) => ({
    bind: (...values) => prepare(sql, values),
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
  });
  let queue = Promise.resolve();
  return { sqlite, prepare, batch(statements) {
    const task = queue.then(async () => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const result = []; for (const s of statements) result.push(await s.run()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    queue = task.catch(() => {}); return task;
  } };
};
