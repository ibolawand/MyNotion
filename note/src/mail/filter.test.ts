import { describe, expect, it } from 'vitest';
import cases from './filter-cases.json';
import { filterReason } from './filter';

describe('filterReason (shared cases, also run by Aria)', () => {
  for (const c of cases as { name: string; from: string; headers: Record<string, string>; alwaysShow?: string[]; expect: string | null }[]) {
    it(c.name, () => {
      expect(filterReason(c.headers, c.from, { alwaysShow: new Set(c.alwaysShow ?? []) })).toBe(c.expect);
    });
  }
});
