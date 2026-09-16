import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playlistHandle, type PlaylistPort, type PlaylistStatus } from './playlist-audio';
import { audioPort } from './audio';

function fixture() {
  let emit!: (status: PlaylistStatus) => void;
  let destroyed = false;
  const queue: { -readonly [K in keyof PlaylistPort]: PlaylistPort[K] } = {
    currentIndex: 0, currentTime: 0, playbackRate: 1,
    currentStatus: { currentIndex: 0, currentTime: 0, isLoaded: true, playing: false, didJustFinish: false },
    skipTo(index) { this.currentIndex = index; this.currentTime = 0; },
    async seekTo(seconds) { this.currentTime = seconds; },
    play() {}, pause() {}, destroy() { destroyed = true; }, release() {},
    onStatus(callback) { emit = callback; return { remove() {} }; },
  };
  return { queue, get destroyed() { return destroyed; }, send(status: Partial<PlaylistStatus>) {
    queue.currentStatus = { ...queue.currentStatus, ...status };
    queue.currentIndex = queue.currentStatus.currentIndex;
    queue.currentTime = queue.currentStatus.currentTime;
    emit(queue.currentStatus);
  } };
}

test('a queued chunk is one timeline and only its last item completes', async () => {
  const f = fixture(); let ends = 0, interruptions = 0;
  const handle = playlistHandle(f.queue, [2, 3, 4]);
  const port = audioPort(async () => {}, () => handle, duration => { assert.equal(duration, 9); ends++; },
    () => {}, () => { interruptions++; });
  await port.prepare(0, 0, 3); port.play();
  assert.equal(f.queue.playbackRate, 3);
  f.send({ playing: true, currentTime: 1.5 }); assert.equal(port.position(), 1.5);
  f.send({ playing: false, isLoaded: false, currentTime: 0 });
  assert.equal(port.position(), 1.5);
  f.send({ currentIndex: 1, isLoaded: true, playing: false, currentTime: 0 });
  assert.equal(port.position(), 2); assert.equal(ends, 0); assert.equal(interruptions, 0);
  f.send({ playing: true, currentTime: 1.25 }); assert.equal(port.position(), 3.25);
  f.send({ currentIndex: 2, currentTime: 4, playing: false, isLoaded: false });
  assert.equal(interruptions, 0);
  f.send({ didJustFinish: true }); f.send({ didJustFinish: true });
  assert.equal(ends, 1); assert.equal(port.position(), 9);
  port.dispose(); assert.equal(f.destroyed, true);
});

test('cumulative seeking maps exact boundaries and interior offsets to original files', async () => {
  const f = fixture(), handle = playlistHandle(f.queue, [2, 3, 4]);
  for (const [position, index, offset] of [[0, 0, 0], [2, 1, 0], [3.75, 1, 1.75], [5, 2, 0], [8.5, 2, 3.5], [9, 2, 4]]) {
    await handle.seekTo(position!);
    assert.equal(f.queue.currentIndex, index); assert.equal(f.queue.currentTime, offset);
    assert.equal(handle.currentTime, position);
  }
  handle.remove();
});

test('explicit native interruption and failed member surface once and dispose the whole queue', async () => {
  for (const failure of [false, true]) {
    const f = fixture(); let errors = 0, interruptions = 0, ends = 0;
    const port = audioPort(async () => {}, () => playlistHandle(f.queue, [2, 3]), () => { ends++; },
      () => { errors++; port.pause(); }, () => { interruptions++; port.pause(); });
    await port.prepare(0, 0, 1); port.play(); f.send({ playing: true, currentTime: 1 });
    const event = failure ? { error: 'unavailable', playing: false } : { playbackInterrupted: true, playing: false };
    f.send(event); f.send(event);
    assert.equal(errors, failure ? 1 : 0); assert.equal(interruptions, failure ? 0 : 1);
    assert.equal(ends, 0); assert.equal(f.destroyed, true); assert.equal(port.position(), 1);
  }
});

test('an interruption immediately after play still stops the queued chunk before any time tick', async () => {
  const f = fixture(); let interruptions = 0;
  const port = audioPort(async () => {}, () => playlistHandle(f.queue, [2, 3]), () => {}, () => {},
    () => { interruptions++; port.pause(); });
  await port.prepare(0, 0, 1); port.play();
  f.send({ playbackInterrupted: true, playing: false });
  assert.equal(interruptions, 1); assert.equal(f.destroyed, true);
});
