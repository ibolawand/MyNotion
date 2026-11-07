import { describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@napi-rs/keyring', () => ({
  Entry: class {
    constructor(private service: string, private user: string) {}
    setPassword(p: string) { store.set(`${this.service}/${this.user}`, p); }
    getPassword() { return store.get(`${this.service}/${this.user}`) ?? null; }
    deletePassword() { return store.delete(`${this.service}/${this.user}`); }
  },
}));

import { forgetAccount, loadAccount, saveAccount, KEYRING_SERVICE } from './account';

describe('account', () => {
  it('keeps the password in the keyring under the address', () => {
    saveAccount('lala@gmail.com', 'abcd efgh ijkl mnop');
    expect(store.get(`${KEYRING_SERVICE}/lala@gmail.com`)).toBe('abcdefghijklmnop');   // spaces from Google's display dropped
    expect(loadAccount('lala@gmail.com')).toEqual({ address: 'lala@gmail.com', password: 'abcdefghijklmnop' });
  });

  it('forgets it', () => {
    saveAccount('lala@gmail.com', 'x');
    forgetAccount('lala@gmail.com');
    expect(loadAccount('lala@gmail.com')).toBeNull();
    expect(loadAccount('')).toBeNull();
  });
});
