import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEnvelope, encodeEnvelope, emptyProgress } from './progress-envelope';

const generation = '11111111-1111-4111-8111-111111111111';
test('v5 envelope validates complete learning payload and head agreement before import', () => {
  const json = encodeEnvelope(emptyProgress(), generation);
  assert.equal(decodeEnvelope(json, generation).generation, generation);
  assert.throws(() => decodeEnvelope(json, ''), /corrupt/);
  assert.throws(() => decodeEnvelope(json.replace('"version":5', '"version":6'), generation), /updateRequired/);
  assert.throws(() => decodeEnvelope(json.replace('"progress":', '"extra":1,"progress":'), generation), /corrupt/);
  assert.throws(() => decodeEnvelope(JSON.stringify({ version: 5, generation, progress: { version: 4, tables: {} } }), generation), /corrupt/);
  assert.throws(() => decodeEnvelope(json.replace(generation, 'not-a-uuid'), 'not-a-uuid'), /corrupt/);
  assert.throws(() => decodeEnvelope(' '.repeat(16 * 1024 * 1024) + json, generation), /tooLarge/);
  assert.equal(decodeEnvelope(emptyProgress(), '').generation, '');
});
