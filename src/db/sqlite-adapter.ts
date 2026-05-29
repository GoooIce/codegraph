/**
 * SQLite Adapter
 *
 * Thin wrapper over `node:sqlite` or `bun:sqlite`, exposed through a small
 * better-sqlite3-shaped interface so the rest of the codebase is
 * storage-agnostic. Runtime detection selects the correct backend.
 */

export interface SqliteStatement {
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  pragma(str: string, options?: { simple?: boolean }): any;
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
  close(): void;
  readonly open: boolean;
}

/**
 * The active SQLite backend. Kept as a named type so `codegraph status` and
 * per-instance reporting have a stable shape.
 */
export type SqliteBackend = 'node-sqlite' | 'bun-sqlite';

/**
 * Wraps Node's built-in `node:sqlite` (`DatabaseSync`) to match the
 * better-sqlite3 interface the rest of the code expects.
 *
 * node:sqlite is real SQLite compiled into Node, so it supports WAL, FTS5,
 * mmap, and `@named` params natively — the only shims needed are the
 * better-sqlite3 conveniences node:sqlite omits: a `.pragma()` helper, a
 * `.transaction()` helper, and `open` (node:sqlite exposes `isOpen`).
 */
class NodeSqliteAdapter implements SqliteDatabase {
  private _db: any;

  constructor(dbPath: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    this._db = new DatabaseSync(dbPath);
  }

  get open(): boolean {
    return this._db.isOpen;
  }

  prepare(sql: string): SqliteStatement {
    // node:sqlite matches better-sqlite3's calling convention (variadic
    // positional args, or a single object for @named params), so params forward
    // through unchanged.
    const stmt = this._db.prepare(sql);
    return {
      run(...params: any[]) {
        const r = stmt.run(...params);
        return {
          changes: Number(r?.changes ?? 0),
          lastInsertRowid: r?.lastInsertRowid ?? 0,
        };
      },
      get(...params: any[]) {
        return stmt.get(...params);
      },
      all(...params: any[]) {
        return stmt.all(...params);
      },
    };
  }

  exec(sql: string): void {
    this._db.exec(sql);
  }

  pragma(str: string, options?: { simple?: boolean }): any {
    const trimmed = str.trim();
    // Write pragma ("key = value"): node:sqlite is real SQLite, so every pragma
    // (WAL, mmap, synchronous, …) applies as-is.
    if (trimmed.includes('=')) {
      this._db.exec(`PRAGMA ${trimmed}`);
      return;
    }
    // Read pragma. Default: the row object (e.g. { journal_mode: 'wal' }).
    // `{ simple: true }` returns just the single column value, like better-sqlite3.
    const row = this._db.prepare(`PRAGMA ${trimmed}`).get();
    if (options?.simple) {
      return row && typeof row === 'object' ? Object.values(row)[0] : row;
    }
    return row;
  }

  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
    return (...args: any[]) => {
      this._db.exec('BEGIN');
      try {
        const result = fn(...args);
        this._db.exec('COMMIT');
        return result;
      } catch (error) {
        this._db.exec('ROLLBACK');
        throw error;
      }
    };
  }

  close(): void {
    // node:sqlite's DatabaseSync.close() throws if already closed; make it
    // idempotent to match better-sqlite3 (callers may close more than once).
    if (this._db.isOpen) this._db.close();
  }
}

/**
 * Wraps Bun's built-in `bun:sqlite` (`Database`) to match the SqliteDatabase
 * interface. bun:sqlite supports WAL, FTS5, mmap, and transactions natively.
 * Key differences from node:sqlite:
 *  - No `isOpen` property — track open state manually.
 *  - `@named` params need the `@` prefix in the object key.
 *  - Statement.run() returns `{ changes, lastInsertRowid }` (same shape).
 */
class BunSqliteAdapter implements SqliteDatabase {
  private _db: any;
  private _open: boolean = true;

  constructor(dbPath: string) {
    // Dynamic require so Node never tries to resolve 'bun:sqlite'.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require('bun:sqlite');
    this._db = new Database(dbPath);
  }

  get open(): boolean {
    return this._open;
  }

  prepare(sql: string): SqliteStatement {
    const stmt = this._db.prepare(sql);
    // bun:sqlite requires the SQL parameter prefix (@, $, :) on the
    // object key when using named parameters. The codebase uses @param
    // style universally, but callers pass bare keys ({ kind: ... } not
    // { "@kind": ... }). Prefix them here so both styles work.
    const prefixParams = (params: any[]): any[] =>
      params.map(p => {
        if (p && typeof p === 'object' && !Array.isArray(p) && !(p instanceof Date)) {
          const obj: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(p)) {
            obj[key.startsWith('@') || key.startsWith('$') || key.startsWith(':') ? key : `@${key}`] = value;
          }
          return obj;
        }
        return p;
      });
    return {
      run(...params: any[]) {
        const r = stmt.run(...prefixParams(params));
        return {
          changes: Number(r?.changes ?? 0),
          lastInsertRowid: r?.lastInsertRowid ?? 0,
        };
      },
      get(...params: any[]) {
        return stmt.get(...prefixParams(params));
      },
      all(...params: any[]) {
        return stmt.all(...prefixParams(params));
      },
    };
  }

  exec(sql: string): void {
    this._db.exec(sql);
  }

  pragma(str: string, options?: { simple?: boolean }): any {
    const trimmed = str.trim();
    if (trimmed.includes('=')) {
      this._db.exec(`PRAGMA ${trimmed}`);
      return;
    }
    const row = this._db.query(`PRAGMA ${trimmed}`).get();
    if (options?.simple) {
      return row && typeof row === 'object' ? Object.values(row)[0] : row;
    }
    return row;
  }

  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
    return this._db.transaction(fn);
  }

  close(): void {
    if (this._open) {
      this._db.close();
      this._open = false;
    }
  }
}

/**
 * Create a database connection backed by `node:sqlite`.
 *
 * Returns the active backend alongside the db so each `DatabaseConnection` can
 * report it per-instance — MCP can open multiple project DBs in one process, so
 * a process-global would race.
 */
export function createDatabase(dbPath: string): { db: SqliteDatabase; backend: SqliteBackend } {
  try {
    if ('bun' in process.versions) {
      return { db: new BunSqliteAdapter(dbPath), backend: 'bun-sqlite' };
    }
    return { db: new NodeSqliteAdapter(dbPath), backend: 'node-sqlite' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const runtime = 'bun' in process.versions ? 'bun:sqlite' : 'node:sqlite';
    throw new Error(
      `Failed to open SQLite via ${runtime}.\n` +
      'Install the self-contained CodeGraph release (it bundles a compatible runtime),\n' +
      'or ensure you are running on a supported Node.js (>= 22.5) or Bun version.\n' +
      `Underlying error: ${msg}`
    );
  }
}
