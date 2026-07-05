// Zero-dependency tests for the pure rule logic. Run: `npm test` (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRule, toDnrRules, MAX_RULES } from '../src/rules.js';

const base = {
  id: 'a',
  enabled: true,
  target: 'request',
  operation: 'set',
  name: 'X-Debug',
  value: '1',
  urlFilter: '',
};

test('valid set rule passes', () => {
  assert.equal(validateRule(base), null);
});

test('remove rule needs no value', () => {
  assert.equal(validateRule({ ...base, operation: 'remove', value: '' }), null);
});

test('set rule requires a value', () => {
  assert.match(validateRule({ ...base, value: '' }), /requires a value/);
});

test('rejects header name with injection chars', () => {
  assert.match(validateRule({ ...base, name: 'Bad Name' }), /invalid characters/);
  assert.match(validateRule({ ...base, name: 'X:Y' }), /invalid characters/);
});

test('rejects CR/LF in value', () => {
  assert.match(validateRule({ ...base, value: 'a\r\nb' }), /CR\/LF/);
});

test('rejects CR/LF in value even for remove op', () => {
  assert.match(
    validateRule({ ...base, operation: 'remove', value: 'a\r\nb' }),
    /CR\/LF/
  );
});

test('rejects bad target/operation', () => {
  assert.match(validateRule({ ...base, target: 'both' }), /target must be/);
  assert.match(validateRule({ ...base, operation: 'nuke' }), /operation must be/);
});

test('rejects non-ASCII urlFilter (DNR requires ASCII)', () => {
  assert.match(validateRule({ ...base, urlFilter: '||exämple.com' }), /ASCII/);
});

test('rejects CR/LF in urlFilter', () => {
  assert.match(validateRule({ ...base, urlFilter: 'a\r\nb' }), /CR\/LF/);
});

test('accepts an ASCII urlFilter', () => {
  assert.equal(validateRule({ ...base, urlFilter: '||example.com/api' }), null);
});

test('toDnrRules maps a request set rule', () => {
  const [r] = toDnrRules({ rules: [base] });
  assert.equal(r.id, 1);
  assert.equal(r.action.type, 'modifyHeaders');
  assert.deepEqual(r.action.requestHeaders, [
    { header: 'X-Debug', operation: 'set', value: '1' },
  ]);
  assert.ok(r.condition.resourceTypes.includes('main_frame'));
});

test('toDnrRules maps a response remove rule (no value)', () => {
  const [r] = toDnrRules({
    rules: [{ ...base, target: 'response', operation: 'remove', value: '' }],
  });
  assert.deepEqual(r.action.responseHeaders, [
    { header: 'X-Debug', operation: 'remove' },
  ]);
});

test('toDnrRules skips disabled and invalid rules', () => {
  const out = toDnrRules({
    rules: [
      base,
      { ...base, id: 'b', enabled: false },
      { ...base, id: 'c', name: 'bad name' },
    ],
  });
  assert.equal(out.length, 1);
});

test('toDnrRules attaches urlFilter when present', () => {
  const [r] = toDnrRules({ rules: [{ ...base, urlFilter: '||example.com' }] });
  assert.equal(r.condition.urlFilter, '||example.com');
});

test('toDnrRules caps at MAX_RULES', () => {
  const many = Array.from({ length: MAX_RULES + 10 }, (_, i) => ({
    ...base,
    id: 'r' + i,
  }));
  assert.equal(toDnrRules({ rules: many }).length, MAX_RULES);
});
