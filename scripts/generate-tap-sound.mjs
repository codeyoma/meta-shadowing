// Original soft, pitched UI pop. No third-party recordings or samples.
import { mkdirSync, writeFileSync } from 'node:fs';
const rate = 44100, duration = 0.13, frames = Math.round(rate * duration);
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
let phase = 0, peak = 0;
for (let i = 0; i < frames; i++) {
  const t = i / rate;
  const frequency = 620 + 360 * Math.exp(-t / 0.022);
  phase += 2 * Math.PI * frequency / rate;
  const attack = Math.min(1, t / 0.003);
  const release = Math.min(1, (duration - t) / 0.025);
  const envelope = attack * release * Math.exp(-t / 0.033);
  const sample = 0.5 * envelope * (0.82 * Math.sin(phase) + 0.13 * Math.sin(phase * 2) + 0.05 * Math.sin(phase * 3));
  peak = Math.max(peak, Math.abs(sample));
  wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
}
const folder = new URL('../assets/sounds/', import.meta.url);
mkdirSync(folder, { recursive: true });
writeFileSync(new URL('tap.wav', folder), wav);
console.log(`Original tap: ${frames} samples, ${duration}s, peak ${peak.toFixed(3)}, mono PCM16.`);
