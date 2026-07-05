// rules.js — validation + conversion from stored Rules to DNR dynamic rules.
// Pure functions, no chrome.* calls, so they are trivially unit-testable.

// RFC 7230 header field-name token charset.
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// DNR dynamic + session rule ceiling (Chrome). Keep a safety margin.
export const MAX_RULES = 5000;

// All DNR resource types. Specified explicitly so rules also apply to the
// top-level page navigation (main_frame), which some Chrome versions exclude
// when resourceTypes is omitted.
const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
  'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket',
  'webtransport', 'webbundle', 'other',
];

/**
 * Validate one stored rule. Returns an error string, or null if valid.
 * A `remove` rule needs no value; `set` requires one.
 */
export function validateRule(rule) {
  if (!rule || typeof rule !== 'object') return 'invalid rule';
  if (rule.target !== 'request' && rule.target !== 'response')
    return 'target must be request or response';
  if (rule.operation !== 'set' && rule.operation !== 'remove')
    return 'operation must be set or remove';
  if (typeof rule.name !== 'string' || !HEADER_NAME_RE.test(rule.name))
    return 'header name has invalid characters';
  if (rule.operation === 'set' && (typeof rule.value !== 'string' || rule.value.length === 0))
    return 'set requires a value';
  // Reject CR/LF in any value (header-injection guard), regardless of operation.
  if (typeof rule.value === 'string' && /[\r\n]/.test(rule.value))
    return 'value must not contain CR/LF';
  if (rule.urlFilter != null && typeof rule.urlFilter !== 'string')
    return 'urlFilter must be a string';
  if (rule.urlFilter && /[\r\n]/.test(rule.urlFilter))
    return 'urlFilter must not contain CR/LF';
  return null;
}

/**
 * Convert enabled, valid rules from a profile into DNR dynamic rules.
 * Skips disabled and invalid rules. Assigns sequential ids starting at 1.
 * @param {{rules: Array}} profile
 * @returns {Array} DNR rule objects
 */
export function toDnrRules(profile) {
  if (!profile || !Array.isArray(profile.rules)) return [];
  const out = [];
  let id = 1;
  for (const rule of profile.rules) {
    if (!rule.enabled) continue;
    if (validateRule(rule) !== null) continue;

    const modifier = { header: rule.name, operation: rule.operation };
    if (rule.operation === 'set') modifier.value = rule.value;

    const action = { type: 'modifyHeaders' };
    if (rule.target === 'request') action.requestHeaders = [modifier];
    else action.responseHeaders = [modifier];

    const condition = { resourceTypes: ALL_RESOURCE_TYPES };
    const filter = (rule.urlFilter || '').trim();
    if (filter) condition.urlFilter = filter;

    out.push({ id: id++, priority: 1, action, condition });
    if (out.length >= MAX_RULES) break;
  }
  return out;
}
