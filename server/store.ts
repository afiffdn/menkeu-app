import fs from 'node:fs';
import path from 'node:path';
import { createDemoSeedState } from './seed';
import { recalculateAllAccountBalances } from './ledger';
import type { DatabaseState } from './types';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'family_finance_db.json');

let memoryState: DatabaseState | null = null;

export function getDbState(): DatabaseState {
  if (memoryState) return memoryState;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as DatabaseState;
      recalculateAllAccountBalances(parsed);
      memoryState = parsed;
      return memoryState;
    } catch {
      // Fallback to fresh seed if corrupted
    }
  }

  const seeded = createDemoSeedState();
  recalculateAllAccountBalances(seeded);
  memoryState = seeded;
  persistDbState(seeded);
  return memoryState;
}

export function persistDbState(state: DatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function mutateDb<T>(fn: (state: DatabaseState) => T): T {
  const state = getDbState();
  const result = fn(state);
  persistDbState(state);
  return result;
}
