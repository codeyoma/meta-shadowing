import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Upgrade guard for events/rate behavior the queue adapter requires from the native SDK.
test('installed Expo playlist reports explicit pause and failures, uses precise seeks and retains 3x', () => {
  const swift = readFileSync('node_modules/expo-audio/ios/AudioPlaylist.swift', 'utf8');
  assert.match(swift, /func pause\(\)[\s\S]*?updateStatus\(with: \["playing": false, "playbackInterrupted": true\]\)/);
  assert.match(swift, /status == \.failed[\s\S]*?"error"/);
  assert.match(swift, /toleranceBefore: \.zero, toleranceAfter: \.zero/);
  assert.match(swift, /min\(rate, 3\.0\)/);
  assert.match(swift, /ref.defaultRate = boundedRate/);
  const module = readFileSync('node_modules/expo-audio/ios/AudioModule.swift', 'utf8');
  assert.match(module, /playable.isPlaying \|\| \(playable as\? AudioPlaylist\)\?\.playbackRequested == true/);
  assert.match(module, /allPlaylists.values.forEach[\s\S]*?"mediaServicesDidReset": true/);
});
