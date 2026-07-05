// storage.js — single source of truth for extension state.
// Uses chrome.storage.local (NOT sync): header values may contain auth tokens /
// secrets that must never leave the machine or replicate to the Google cloud.

const KEY = 'state';

/** @typedef {{
 *   id: string,
 *   enabled: boolean,
 *   target: 'request' | 'response',
 *   operation: 'set' | 'remove',
 *   name: string,
 *   value: string,
 *   urlFilter?: string
 * }} Rule */

/** @typedef {{ id: string, name: string, rules: Rule[] }} Profile */

/** @typedef {{
 *   masterEnabled: boolean,
 *   activeProfileId: string,
 *   profiles: Profile[]
 * }} State */

/** Small unique-ish id without needing crypto/uuid deps. */
export function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

/** @returns {State} */
export function defaultState() {
  const profileId = uid();
  return {
    masterEnabled: true,
    activeProfileId: profileId,
    profiles: [{ id: profileId, name: 'Default', rules: [] }],
  };
}

/** @returns {Promise<State>} */
export async function getState() {
  const stored = await chrome.storage.local.get(KEY);
  const state = stored[KEY];
  if (!state || !Array.isArray(state.profiles) || state.profiles.length === 0) {
    const fresh = defaultState();
    await chrome.storage.local.set({ [KEY]: fresh });
    return fresh;
  }
  return state;
}

/** @param {State} state */
export async function setState(state) {
  await chrome.storage.local.set({ [KEY]: state });
}

/** @param {State} state @returns {Profile} */
export function activeProfile(state) {
  return (
    state.profiles.find((p) => p.id === state.activeProfileId) ||
    state.profiles[0]
  );
}

/** Subscribe to state changes (fires in any context). @param {(s: State) => void} cb */
export function onStateChange(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) cb(changes[KEY].newValue);
  });
}
