// Tests for profile export/import serialization. Run: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  profileToJSON,
  profileFromJSON,
  ruleLine,
  diffProfiles,
} from '../src/io.js';

const profile = {
  id: 'p1',
  name: 'Dev',
  rules: [
    {
      id: 'r1',
      enabled: true,
      target: 'request',
      operation: 'set',
      name: 'X-Debug',
      value: '1',
      urlFilter: '||example.com',
    },
    {
      id: 'r2',
      enabled: false,
      target: 'response',
      operation: 'remove',
      name: 'X-Frame-Options',
      value: '',
      urlFilter: '',
    },
  ],
};

test('profileToJSON strips ids and keeps rule fields', () => {
  const out = profileToJSON(profile);
  assert.equal(out.name, 'Dev');
  assert.equal(out.rules.length, 2);
  assert.equal(out.rules[0].id, undefined);
  assert.equal(out.rules[0].name, 'X-Debug');
  assert.equal(out.rules[1].operation, 'remove');
});

test('round-trip preserves rule content (ids regenerated)', () => {
  const json = JSON.stringify(profileToJSON(profile));
  const back = profileFromJSON(json);
  assert.equal(back.name, 'Dev');
  assert.equal(back.rules.length, 2);
  assert.equal(back.rules[0].name, 'X-Debug');
  assert.equal(back.rules[0].urlFilter, '||example.com');
  assert.equal(back.rules[1].enabled, false);
  // fresh ids
  assert.ok(back.id && back.id !== 'p1');
  assert.ok(back.rules[0].id && back.rules[0].id !== 'r1');
});

test('accepts a parsed object as well as a string', () => {
  const back = profileFromJSON({ name: 'X', rules: [] });
  assert.equal(back.name, 'X');
  assert.deepEqual(back.rules, []);
});

test('throws on non-object / missing rules array', () => {
  assert.throws(() => profileFromJSON('123'), /Not a profile/);
  assert.throws(() => profileFromJSON('{"name":"x"}'), /Not a profile/);
  assert.throws(() => profileFromJSON('[]'), /Not a profile/);
});

test('throws on invalid JSON syntax', () => {
  assert.throws(() => profileFromJSON('{ not json }'), SyntaxError);
});

test('sanitizes hostile / malformed rule fields to safe defaults', () => {
  const back = profileFromJSON({
    name: '  Trimmed  ',
    rules: [
      { target: 'evil', operation: 'nuke', name: 42, value: {}, urlFilter: [] },
      null,
    ],
  });
  assert.equal(back.name, 'Trimmed');
  const r = back.rules[0];
  assert.equal(r.target, 'request'); // coerced from 'evil'
  assert.equal(r.operation, 'set'); // coerced from 'nuke'
  assert.equal(r.name, ''); // non-string dropped
  assert.equal(r.value, ''); // non-string dropped
  assert.equal(r.urlFilter, ''); // non-string dropped
  assert.equal(back.rules[1].target, 'request'); // null rule → safe default
});

test('missing name defaults to "Imported"', () => {
  assert.equal(profileFromJSON({ rules: [] }).name, 'Imported');
});

/* ---- diff view ---- */

test('ruleLine renders a readable summary', () => {
  assert.equal(
    ruleLine({ target: 'request', operation: 'set', name: 'X-Debug', value: '1', urlFilter: '||ex.com' }),
    '[req set] X-Debug: 1  @||ex.com'
  );
  assert.equal(
    ruleLine({ target: 'response', operation: 'remove', name: 'X-Frame-Options', value: '', urlFilter: '' }),
    '[res remove] X-Frame-Options'
  );
});

const mk = (over) => ({
  enabled: true, target: 'request', operation: 'set',
  name: 'X', value: '1', urlFilter: '', ...over,
});

test('diffProfiles counts additions and removals', () => {
  const cur = { name: 'A', rules: [mk({ name: 'Keep' }), mk({ name: 'Gone' })] };
  const inc = { name: 'A', rules: [mk({ name: 'Keep' }), mk({ name: 'New' })] };
  const d = diffProfiles(cur, inc);
  assert.equal(d.added, 1);
  assert.equal(d.removed, 1);
  assert.equal(d.nameChanged, false);
  assert.ok(d.lines.some((l) => l.sign === '+' && /New/.test(l.text)));
  assert.ok(d.lines.some((l) => l.sign === '-' && /Gone/.test(l.text)));
  assert.ok(d.lines.some((l) => l.sign === ' ' && /Keep/.test(l.text)));
});

test('diffProfiles shows a value change as remove+add pair', () => {
  const cur = { name: 'A', rules: [mk({ name: 'X', value: 'old' })] };
  const inc = { name: 'A', rules: [mk({ name: 'X', value: 'new' })] };
  const d = diffProfiles(cur, inc);
  assert.equal(d.added, 1);
  assert.equal(d.removed, 1);
});

test('diffProfiles flags a renamed profile with zero rule changes', () => {
  const cur = { name: 'Dev', rules: [mk({ name: 'X' })] };
  const inc = { name: 'Staging', rules: [mk({ name: 'X' })] };
  const d = diffProfiles(cur, inc);
  assert.equal(d.added, 0);
  assert.equal(d.removed, 0);
  assert.equal(d.nameChanged, true);
  assert.equal(d.nameFrom, 'Dev');
  assert.equal(d.nameTo, 'Staging');
});
