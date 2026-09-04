import { getSupportedAudioFormat } from "./audio-format";

function startsWith(bytes: Uint8Array, signature: number[]) {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

export function hasSupportedAudioSignature(fileName: string, bytes: Uint8Array) {
  const format = getSupportedAudioFormat(fileName);
  if (!format) return false;

  if (format.extension === "mp3") {
    return (
      startsWith(bytes, [0x49, 0x44, 0x33]) ||
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    );
  }
  if (format.extension === "m4a") {
    return bytes.length >= 8 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  }
  return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
}
