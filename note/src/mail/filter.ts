/**
 * The second net behind Gmail's own sorting (we only fetch the Primary tab): hides what still looks like a newsletter
 * or an ad. Returns why it's hidden, or null to show it. Same rules as BetterAI/Engines/MailFilter.py — both run the
 * cases in filter-cases.json, so keep them in step.
 */
export type Headers = Record<string, string>;   // lower-case header names

const NO_REPLY = /^(no-?reply|do-?not-?reply|newsletter|marketing|promo(tions?)?|news|deals|offers)@/i;

export function filterReason(headers: Headers, from: string, rules: { alwaysShow: Set<string> }): string | null {
  const sender = (from || '').trim().toLowerCase();
  for (const a of rules.alwaysShow) if (a.toLowerCase() === sender) return null;
  if (headers['list-unsubscribe'] || headers['list-id']) return 'newsletter';
  if (/^(bulk|list|junk)$/i.test((headers['precedence'] || '').trim())) return 'bulk';
  if (NO_REPLY.test(sender)) return 'no-reply sender';
  return null;
}
