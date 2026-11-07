/**
 * The Gmail app password lives only in the system keyring (Secret Service): service "MyNotion Mail",
 * account = the address. Aria reads the same entry (BetterAI/Engines/MailAccount.py). The address itself is
 * kept in the mail_state table, so it's known without unlocking anything.
 */
import { Entry } from '@napi-rs/keyring';

export const KEYRING_SERVICE = 'MyNotion Mail';

export interface Account { address: string; password: string; }

export function saveAccount(address: string, password: string): void {
  // Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); the spaces aren't part of it
  new Entry(KEYRING_SERVICE, address).setPassword(password.replace(/\s+/g, ''));
}

export function loadAccount(address: string): Account | null {
  if (!address) return null;
  try {
    const password = new Entry(KEYRING_SERVICE, address).getPassword();
    return password ? { address, password } : null;
  } catch {
    return null;   // no Secret Service (locked or not running)
  }
}

export function forgetAccount(address: string): void {
  try { new Entry(KEYRING_SERVICE, address).deletePassword(); } catch { /* already gone */ }
}
