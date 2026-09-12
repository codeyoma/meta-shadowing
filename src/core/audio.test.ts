import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioPort, type NativeHandle, type NativeStatus } from './audio';

test('the selected playback rate reaches each newly prepared native handle unchanged', async () => {
  const rates: number[] = [];
  const port = audioPort(async () => {}, () => ({
    currentTime: 0, duration: 4,
    currentStatus: { isLoaded: true, playing: false, duration: 4, didJustFinish: false, error: null },
    setPlaybackRate: rate => { rates.push(rate); }, seekTo: async () => {},
    play: () => {}, remove: () => {}, onStatus: () => ({ remove: () => {} }),
  }), () => {}, () => {}, () => {});
  for (const rate of [0.25, 0.3, 1, 2.5, 3]) {
    await port.prepare(0, 0, rate);
    port.play(); port.pause();
  }
  assert.deepEqual(rates, [0.25, 0.3, 1, 2.5, 3]);
  port.dispose();
});

test('progress exposes real media duration while loaded and no stale duration after release', async () => {
  const port = audioPort(async () => {}, () => ({ currentTime: 0, duration: 4.25,
    currentStatus: { isLoaded: true, playing: false, duration: 4.25, didJustFinish: false, error: null },
    setPlaybackRate: () => {}, seekTo: async () => {}, play: () => {}, remove: () => {},
    onStatus: () => ({ remove: () => {} }),
  }), () => {}, () => {}, () => {});
  assert.equal(port.duration?.() ?? 0, 0);
  await port.prepare(0, 0, 1);
  assert.equal(port.duration?.(), 4.25);
  port.pause();
  assert.equal(port.duration?.(), 0);
});

test('pause releases native auto-resume state, remembers position, and recreates on explicit resume', async () => {
  const handles: NativeHandle[] = [];
  let removes = 0, plays = 0;
  const port = audioPort(async () => {}, () => {
    const h: NativeHandle = {
      currentTime: 1.75, duration: 4,
      currentStatus: { isLoaded: true, playing: false, duration: 4, didJustFinish: false, error: null },
      setPlaybackRate: () => {}, seekTo: async value => { h.currentTime = value; },
      play: () => { plays++; }, remove: () => { removes++; },
      onStatus: () => ({ remove: () => {} }),
    };
    handles.push(h); return h;
  }, () => {}, () => {}, () => {});
  await port.prepare(0, 0, 1);
  port.play();
  handles[0]!.currentTime = 1.75;
  port.pause();
  assert.equal(removes, 1);
  assert.equal(port.position(), 1.75);
  await port.prepare(0, port.position(), 1);
  assert.equal(handles.length, 2);
  assert.equal(handles[1]?.currentTime, 1.75);
  assert.equal(plays, 1);
  port.play();
  assert.equal(plays, 2);
  port.dispose();
});

test('an unexpected native pause asks the engine to checkpoint, without counting audio completion', async () => {
  let emit!: (s: NativeStatus) => void;
  let interruptions = 0, ended = 0;
  const status: NativeStatus = { isLoaded: true, playing: false, duration: 4, didJustFinish: false, error: null };
  const port = audioPort(async () => {}, () => ({ currentTime: 1, duration: 4, currentStatus: status,
    setPlaybackRate: () => {}, seekTo: async () => {}, play: () => {}, remove: () => {},
    onStatus: callback => { emit = callback; return { remove: () => {} }; },
  }), () => { ended++; }, () => {}, () => { interruptions++; port.pause(); });
  await port.prepare(0, 0, 1); port.play();
  emit({ ...status, playing: true });
  emit(status);
  assert.equal(interruptions, 1); assert.equal(ended, 0);
  port.dispose();
});

test('a native error during pending seek rejects preparation even if that seek later finishes', async () => {
  let emit!: (s: NativeStatus) => void;
  let finishSeek!: () => void;
  const status: NativeStatus = { isLoaded: true, playing: false, duration: 4, didJustFinish: false, error: null };
  const port = audioPort(async () => {}, () => ({ currentTime: 1, duration: 4, currentStatus: status,
    setPlaybackRate: () => {}, seekTo: () => new Promise<void>(resolve => { finishSeek = resolve; }),
    play: () => {}, remove: () => {}, onStatus: callback => { emit = callback; return { remove: () => {} }; },
  }), () => {}, () => {}, () => {});
  const preparing = port.prepare(0, 1, 1);
  await Promise.resolve();
  emit({ ...status, error: 'test loading failure' });
  finishSeek();
  await assert.rejects(preparing, /Audio unavailable/);
  port.dispose();
});

test('disposing during configuration creates no late native player', async () => {
  let configure!: () => void, creates = 0;
  const port = audioPort(() => new Promise<void>(resolve => { configure = resolve; }),
    () => { creates++; throw Error('Must not create'); }, () => {}, () => {}, () => {});
  const preparing = port.prepare(0, 1, 1);
  port.dispose(); configure();
  await assert.rejects(preparing, /cancelled/);
  assert.equal(creates, 0);
});

test('a cancelled old seek cannot interrupt a replacement player', async () => {
  const callbacks: ((s: NativeStatus) => void)[] = [];
  let finishOldSeek!: () => void, created = 0, interruptions = 0;
  const status: NativeStatus = { isLoaded: true, playing: false, duration: 4, didJustFinish: false, error: null };
  const port = audioPort(async () => {}, () => {
    const old = created++ === 0;
    return { currentTime: 1, duration: 4, currentStatus: status, setPlaybackRate: () => {},
      seekTo: () => old ? new Promise<void>(resolve => { finishOldSeek = resolve; }) : Promise.resolve(),
      play: () => {}, remove: () => {}, onStatus: callback => { callbacks.push(callback); return { remove: () => {} }; },
    };
  }, () => {}, () => {}, () => { interruptions++; });
  const old = port.prepare(0, 1, 1);
  const cancelled = assert.rejects(old, /cancelled/);
  await Promise.resolve();
  port.pause();
  await port.prepare(0, 1, 1);
  port.play(); callbacks[1]!({ ...status, playing: true });
  finishOldSeek();
  await cancelled;
  await Promise.resolve();
  assert.equal(interruptions, 0);
  port.dispose();
});
