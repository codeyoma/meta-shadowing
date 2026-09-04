import { describe, expect, it } from "vitest";
import { mapAudioPackage } from "./audio-package";
import type { LessonDraftEntry } from "./lesson-draft-parser";

const entries: LessonDraftEntry[] = [
  { kind: "chapter", sourceLine: 1, target: "Morning", korean: "아침" },
  {
    kind: "phrase",
    sourceLine: 2,
    phraseNumber: 1,
    target: "Good morning.",
    korean: "좋은 아침입니다."
  },
  { kind: "section", sourceLine: 3 },
  {
    kind: "phrase",
    sourceLine: 4,
    phraseNumber: 2,
    target: "I wash my face.",
    korean: "세수합니다."
  },
  {
    kind: "phrase",
    sourceLine: 5,
    phraseNumber: 3,
    target: "I brush my teeth.",
    korean: "이를 닦습니다."
  }
];

describe("mapAudioPackage", () => {
  it("naturally maps numbered audio only to ordinary phrases", () => {
    const result = mapAudioPackage(entries, [
      { name: "003-teeth.webm", size: 30, type: "audio/webm" },
      { name: "001-morning.mp3", size: 10, type: "audio/mpeg" },
      { name: "002-wash.m4a", size: 20, type: "audio/mp4" }
    ]);

    expect(result.publishReady).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.items).toEqual([
      {
        phraseNumber: 1,
        sourceLine: 2,
        originalName: "001-morning.mp3",
        canonicalName: "001.mp3",
        contentType: "audio/mpeg",
        size: 10
      },
      {
        phraseNumber: 2,
        sourceLine: 4,
        originalName: "002-wash.m4a",
        canonicalName: "002.m4a",
        contentType: "audio/mp4",
        size: 20
      },
      {
        phraseNumber: 3,
        sourceLine: 5,
        originalName: "003-teeth.webm",
        canonicalName: "003.webm",
        contentType: "audio/webm",
        size: 30
      }
    ]);
  });

  it("blocks publishing when an ordinary phrase has no audio", () => {
    const result = mapAudioPackage(entries, [
      { name: "001-morning.mp3", size: 10, type: "audio/mpeg" },
      { name: "003-teeth.webm", size: 30, type: "audio/webm" }
    ]);

    expect(result.publishReady).toBe(false);
    expect(result.issues).toContainEqual({
      code: "missing-audio",
      phraseNumber: 2,
      message: "2번 프레이즈의 음성 파일이 없습니다. 002로 시작하는 파일을 추가해 주세요."
    });
  });

  it("blocks publishing when two files use the same phrase number", () => {
    const result = mapAudioPackage(entries, [
      { name: "001-first.mp3", size: 10, type: "audio/mpeg" },
      { name: "001-copy.webm", size: 11, type: "audio/webm" },
      { name: "002-wash.m4a", size: 20, type: "audio/mp4" },
      { name: "003-teeth.webm", size: 30, type: "audio/webm" }
    ]);

    expect(result.publishReady).toBe(false);
    expect(result.issues).toContainEqual({
      code: "duplicate-audio-number",
      phraseNumber: 1,
      fileName: "001-copy.webm",
      message: "1번 프레이즈의 음성 파일 번호가 중복됩니다. 번호마다 파일을 하나만 남겨 주세요."
    });
  });

  it("blocks publishing for unsupported audio formats", () => {
    const result = mapAudioPackage(entries, [
      { name: "001-morning.mp3", size: 10, type: "audio/mpeg" },
      { name: "002-wash.wav", size: 20, type: "audio/wav" },
      { name: "003-teeth.webm", size: 30, type: "audio/webm" }
    ]);

    expect(result.publishReady).toBe(false);
    expect(result.issues).toContainEqual({
      code: "unsupported-audio-format",
      fileName: "002-wash.wav",
      message: "002-wash.wav은(는) 지원하지 않는 형식입니다. MP3, M4A, WebM 파일만 사용해 주세요."
    });
  });

  it("blocks publishing for missing, zero, or out-of-range three-digit numbers", () => {
    const result = mapAudioPackage(entries, [
      { name: "morning.mp3", size: 10, type: "audio/mpeg" },
      { name: "000-wash.m4a", size: 20, type: "audio/mp4" },
      { name: "004-teeth.webm", size: 30, type: "audio/webm" }
    ]);

    expect(result.publishReady).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          code: "invalid-audio-number",
          fileName: "morning.mp3",
          message: "morning.mp3의 파일명은 001처럼 세 자리 번호로 시작해야 합니다."
        },
        {
          code: "invalid-audio-number",
          fileName: "000-wash.m4a",
          message: "000-wash.m4a의 번호 000은(는) 유효한 프레이즈 범위 001~003 밖입니다."
        },
        {
          code: "invalid-audio-number",
          fileName: "004-teeth.webm",
          message: "004-teeth.webm의 번호 004은(는) 유효한 프레이즈 범위 001~003 밖입니다."
        }
      ])
    );
  });
});
