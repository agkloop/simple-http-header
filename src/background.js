// background.js — service worker. Single job: keep DNR dynamic rules in sync
// with the active profile, and reflect on/off state in the toolbar badge.

import { getState, activeProfile, onStateChange } from './storage.js';
import { toDnrRules } from './rules.js';

// Serialize syncs: overlapping updateDynamicRules calls (four independent
// triggers below) could interleave and leave DNR in a stale state, so every
// sync runs strictly after the previous one settles.
let syncChain = Promise.resolve();
function scheduleSync() {
  syncChain = syncChain.then(sync, sync);
  return syncChain;
}

async function sync() {
  const state = await getState();

  const desired =
    state.masterEnabled ? toDnrRules(activeProfile(state)) : [];

  try {
    // Atomic replace: drop every existing dynamic rule, add the desired set.
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: desired,
    });
    updateBadge(state.masterEnabled, desired.length);
  } catch (err) {
    // Quota exceeded / rejected rule: surface on the badge instead of dying
    // with an unhandled rejection (which would restart the worker in a loop).
    console.error('Simple HTTP Header: rule sync failed —', err);
    chrome.action.setBadgeBackgroundColor({ color: '#d64545' });
    chrome.action.setBadgeText({ text: 'err' });
  }
}

function updateBadge(enabled, count) {
  if (!enabled) {
    chrome.action.setBadgeBackgroundColor({ color: '#9aa0a6' });
    chrome.action.setBadgeText({ text: 'off' });
    return;
  }
  chrome.action.setBadgeBackgroundColor({ color: '#2f6feb' });
  chrome.action.setBadgeText({ text: count ? String(count) : '' });
}

chrome.runtime.onInstalled.addListener(scheduleSync);
chrome.runtime.onStartup.addListener(scheduleSync);
onStateChange(scheduleSync);

// Sync once on worker spin-up too (covers reloads where the events above
// have already fired).
scheduleSync();
