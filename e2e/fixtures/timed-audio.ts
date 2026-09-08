// Two seconds of PCM silence with explicit duration metadata for browser progress tests.
export const timedRecording = Buffer.alloc(44 + 8_000 * 2 * 2);
timedRecording.write("RIFF", 0); timedRecording.writeUInt32LE(timedRecording.length - 8, 4); timedRecording.write("WAVEfmt ", 8);
timedRecording.writeUInt32LE(16, 16); timedRecording.writeUInt16LE(1, 20); timedRecording.writeUInt16LE(1, 22);
timedRecording.writeUInt32LE(8_000, 24); timedRecording.writeUInt32LE(16_000, 28);
timedRecording.writeUInt16LE(2, 32); timedRecording.writeUInt16LE(16, 34);
timedRecording.write("data", 36); timedRecording.writeUInt32LE(timedRecording.length - 44, 40);
