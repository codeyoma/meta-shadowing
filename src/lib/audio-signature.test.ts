import { describe, expect, it } from "vitest";
import { hasSupportedAudioSignature } from "./audio-signature";

describe("hasSupportedAudioSignature", () => {
  it("recognizes MP3 ID3 and MPEG frame signatures", () => {
    expect(hasSupportedAudioSignature("001.mp3", Uint8Array.from([0x49, 0x44, 0x33, 0x04]))).toBe(true);
    expect(hasSupportedAudioSignature("001.mp3", Uint8Array.from([0xff, 0xfb, 0x90, 0x64]))).toBe(true);
  });

  it("recognizes M4A and WebM container signatures", () => {
    expect(
      hasSupportedAudioSignature(
        "001.m4a",
        Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41])
      )
    ).toBe(true);
    expect(
      hasSupportedAudioSignature("001.webm", Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]))
    ).toBe(true);
  });

  it("rejects renamed or truncated content", () => {
    expect(hasSupportedAudioSignature("001.mp3", Uint8Array.from([0x52, 0x49, 0x46, 0x46]))).toBe(false);
    expect(hasSupportedAudioSignature("001.webm", Uint8Array.from([0x1a, 0x45]))).toBe(false);
  });
});
