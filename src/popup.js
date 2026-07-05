// popup.js — the entire UI. Reads/writes state via storage.js; the background
// worker independently mirrors state into DNR rules, so this file never touches
// chrome.declarativeNetRequest directly.
//
// Note: chrome BLOCKS window.prompt/confirm/alert inside MV3 popups, so every
// interaction here is built from real DOM controls — no JS dialogs.

import { getState, setState, activeProfile, uid } from './storage.js';
import { validateRule } from './rules.js';

const $ = (sel) => document.querySelector(sel);
const listEl = $('#list');
const emptyEl = $('#empty');
const masterEl = $('#master');
const profileEl = $('#profile');
const profileNameEl = $('#profile-name');
const rowTpl = $('#row-tpl');

let state; // local working copy; single source while popup is open

// Debounced persist — typing triggers one DNR resync per burst, not per key.
let saveTimer = null;
let pendingSave = false;
function persist(immediate = false) {
  clearTimeout(saveTimer);
  if (immediate) {
    pendingSave = false;
    setState(state);
  } else {
    pendingSave = true;
    saveTimer = setTimeout(() => {
      pendingSave = false;
      setState(state);
    }, 300);
  }
}

// Flush any pending debounced write before the popup can be torn down —
// otherwise the last keystrokes are lost when the user closes it quickly.
function flush() {
  if (!pendingSave) return;
  clearTimeout(saveTimer);
  pendingSave = false;
  setState(state);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', flush);
window.addEventListener('blur', flush);

function newRule() {
  return {
    id: uid(),
    enabled: true,
    target: 'request',
    operation: 'set',
    name: '',
    value: '',
    urlFilter: '',
  };
}

/* ---------- rendering ---------- */

function render() {
  masterEl.checked = state.masterEnabled;
  listEl.classList.toggle('dim', !state.masterEnabled);

  // Profile dropdown
  profileEl.innerHTML = '';
  for (const p of state.profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === state.activeProfileId) opt.selected = true;
    profileEl.appendChild(opt);
  }
  $('#del-profile').disabled = state.profiles.length <= 1;

  const rules = activeProfile(state).rules;
  listEl.innerHTML = '';
  emptyEl.hidden = rules.length > 0;
  for (const rule of rules) listEl.appendChild(renderRow(rule));
}

function renderRow(rule) {
  const node = rowTpl.content.firstElementChild.cloneNode(true);
  const en = node.querySelector('.en');
  const name = node.querySelector('.name');
  const value = node.querySelector('.value');
  const url = node.querySelector('.url');
  const del = node.querySelector('.del');
  const targetSeg = node.querySelector('.seg.target');
  const opSeg = node.querySelector('.seg.op');

  en.checked = rule.enabled;
  name.value = rule.name;
  value.value = rule.value;
  url.value = rule.urlFilter || '';
  paintSeg(node, rule);
  applyOpState(node, rule);
  markValidity(node, rule);

  en.addEventListener('change', () => {
    rule.enabled = en.checked;
    persist(true);
  });

  // Two-button segmented controls: clicking one overrides the other.
  targetSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-target]');
    if (!btn) return;
    rule.target = btn.dataset.target;
    paintSeg(node, rule);
    persist(true);
  });
  opSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-op]');
    if (!btn) return;
    rule.operation = btn.dataset.op;
    paintSeg(node, rule);
    applyOpState(node, rule);
    markValidity(node, rule);
    persist(true);
  });

  name.addEventListener('input', () => {
    rule.name = name.value.trim();
    markValidity(node, rule);
    persist();
  });
  value.addEventListener('input', () => {
    rule.value = value.value;
    markValidity(node, rule);
    persist();
  });
  url.addEventListener('input', () => {
    rule.urlFilter = url.value.trim();
    markValidity(node, rule);
    persist();
  });
  del.addEventListener('click', () => {
    const prof = activeProfile(state);
    const i = prof.rules.findIndex((r) => r.id === rule.id);
    if (i < 0) return;
    const [removed] = prof.rules.splice(i, 1);
    persist(true);
    render();
    showUndo('Rule deleted', () => {
      prof.rules.splice(Math.min(i, prof.rules.length), 0, removed);
      persist(true);
      render();
    });
  });

  return node;
}

function paintSeg(node, rule) {
  for (const b of node.querySelectorAll('.seg.target button')) {
    const active = b.dataset.target === rule.target;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  for (const b of node.querySelectorAll('.seg.op button')) {
    const active = b.dataset.op === rule.operation;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

// A `remove` rule has no value — grey the field out.
function applyOpState(node, rule) {
  const value = node.querySelector('.value');
  value.disabled = rule.operation === 'remove';
  value.placeholder = rule.operation === 'remove' ? '(no value needed)' : 'value';
}

// Security headers that are dangerous to weaken across every site.
const SENSITIVE_HEADERS = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
]);

// Shows the concrete validation error (red) OR a non-blocking warning (amber)
// when a response rule with no url filter would touch every site.
function markValidity(node, rule) {
  const err = validateRule(rule);
  node.classList.toggle('invalid', err !== null);
  const msg = node.querySelector('.msg');

  if (err) {
    msg.textContent = err;
    msg.className = 'msg err';
    msg.hidden = false;
    return;
  }

  const noFilter = !(rule.urlFilter && rule.urlFilter.trim());
  if (rule.target === 'response' && noFilter && rule.name) {
    const sensitive = SENSITIVE_HEADERS.has(rule.name.toLowerCase());
    msg.textContent = sensitive
      ? `⚠ Changing ${rule.name} on ALL sites can weaken your browser's security — add a url filter.`
      : '⚠ Applies to every site (no url filter).';
    msg.className = 'msg warn';
    msg.hidden = false;
    return;
  }

  msg.hidden = true;
  msg.textContent = '';
}

/* ---------- undo toast for destructive actions ---------- */

let toastTimer = null;
function showUndo(message, restore) {
  const toast = $('#toast');
  const undoBtn = $('#toast-undo');
  $('#toast-text').textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);

  const onUndo = () => {
    clearTimeout(toastTimer);
    toast.hidden = true;
    undoBtn.removeEventListener('click', onUndo);
    restore();
  };
  undoBtn.addEventListener('click', onUndo);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
    undoBtn.removeEventListener('click', onUndo);
  }, 6000);
}

/* ---------- top-bar actions ---------- */

masterEl.addEventListener('change', () => {
  state.masterEnabled = masterEl.checked;
  listEl.classList.toggle('dim', !state.masterEnabled);
  persist(true);
});

$('#help-btn').addEventListener('click', () => {
  const help = $('#help');
  help.hidden = !help.hidden;
  $('#help-btn').classList.toggle('active', !help.hidden);
});

$('#add').addEventListener('click', () => {
  activeProfile(state).rules.push(newRule());
  persist(true);
  render();
  listEl.querySelector('.row:last-child .name')?.focus();
});

profileEl.addEventListener('change', () => {
  state.activeProfileId = profileEl.value;
  persist(true);
  render();
});

/* ---------- profile management (inline, no dialogs) ---------- */

$('#new-profile').addEventListener('click', () => {
  const n = state.profiles.length + 1;
  const p = { id: uid(), name: `Profile ${n}`, rules: [] };
  state.profiles.push(p);
  state.activeProfileId = p.id;
  persist(true);
  render();
  startRename(); // let the user name it immediately
});

$('#del-profile').addEventListener('click', () => {
  if (state.profiles.length <= 1) return;
  const idx = state.profiles.findIndex((p) => p.id === state.activeProfileId);
  const removed = state.profiles[idx];
  const prevActive = state.activeProfileId;
  state.profiles.splice(idx, 1);
  state.activeProfileId = state.profiles[0].id;
  persist(true);
  render();
  showUndo(`Profile “${removed.name}” deleted`, () => {
    state.profiles.splice(Math.min(idx, state.profiles.length), 0, removed);
    state.activeProfileId = prevActive;
    persist(true);
    render();
  });
});

$('#rename-profile').addEventListener('click', startRename);

// Rename swaps the <select> for a text input; Enter/blur commits, Esc cancels.
function startRename() {
  const p = activeProfile(state);
  profileEl.hidden = true;
  profileNameEl.hidden = false;
  profileNameEl.value = p.name;
  profileNameEl.focus();
  profileNameEl.select();
}

function commitRename() {
  if (profileNameEl.hidden) return;
  const p = activeProfile(state);
  const v = profileNameEl.value.trim();
  if (v) p.name = v;
  profileNameEl.hidden = true;
  profileEl.hidden = false;
  persist(true);
  render();
}

profileNameEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') commitRename();
  else if (e.key === 'Escape') {
    profileNameEl.hidden = true;
    profileEl.hidden = false;
  }
});
profileNameEl.addEventListener('blur', commitRename);

/* ---------- boot ---------- */

(async () => {
  state = await getState();
  render();
})();
