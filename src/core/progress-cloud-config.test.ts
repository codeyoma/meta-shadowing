import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const plugin = require('../../modules/progress-cloud/app.plugin.js');

test('missing CloudKit configuration clears stale module markers while preserving other plist values', async () => {
  const config = { name: 'Test', slug: 'test', ios: { infoPlist: { Existing: true } } };
  const result = plugin(config, {});
  const plist = await result.mods.ios.infoPlist({ modResults: {
    Existing: true, LearningBookProductID: 'example.book', ProgressCloudConfigured: true,
    ProgressCloudContainer: 'iCloud.com.example.progress', ProgressCloudEnvironment: 'Development',
  }, modRequest: {} });
  assert.deepEqual(plist.modResults, { Existing: true, LearningBookProductID: 'example.book' });
});

test('configures only the supplied private container with matched environment and push capability', async () => {
  const config = plugin({ name: 'Test', slug: 'test' }, { container: 'iCloud.com.example.progress', environment: 'Development' });
  const entitlements = await config.mods.ios.entitlements({ modResults: { Existing: true }, modRequest: {} });
  assert.deepEqual(entitlements.modResults, {
    Existing: true,
    'com.apple.developer.icloud-container-identifiers': ['iCloud.com.example.progress'],
    'com.apple.developer.icloud-services': ['CloudKit'],
    'com.apple.developer.icloud-container-environment': 'Development',
    'aps-environment': 'development',
  });
  const plist = await config.mods.ios.infoPlist({ modResults: { LearningBookProductID: 'example.book', UIBackgroundModes: ['audio'] }, modRequest: {} });
  assert.equal(plist.modResults.LearningBookProductID, 'example.book');
  assert.equal(plist.modResults.ProgressCloudContainer, 'iCloud.com.example.progress');
  assert.equal(plist.modResults.ProgressCloudEnvironment, 'Development');
  assert.equal(plist.modResults.ProgressCloudConfigured, true);
  assert.deepEqual(plist.modResults.UIBackgroundModes, ['audio', 'remote-notification']);
});

test('rejects malformed identifiers and mismatched environment without exposing supplied values', () => {
  assert.throws(() => plugin({}, { container: 'invalid private value' }), /^Error: Invalid APPLE_CLOUDKIT_CONTAINER$/);
  assert.throws(() => plugin({}, { container: 'iCloud.com.example.progress', environment: 'invalid' }), /^Error: Invalid APPLE_CLOUDKIT_ENVIRONMENT$/);
});
