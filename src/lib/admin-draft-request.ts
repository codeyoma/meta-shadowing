import "server-only";

import { parseLessonDraft, type LessonDraftParseResult } from "./lesson-draft-parser";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 5 * 1024 * 1024;

export class DraftRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export type LessonDraftImport = {
  title: string;
  language: "english" | "japanese";
  targetFilename: string;
  koreanFilename: string;
  targetSource: string;
  koreanSource: string;
  parseResult: LessonDraftParseResult;
};

function readField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function readUtf8TextFile(formData: FormData, name: string, label: string) {
  const value = formData.get(name);
  if (!(value instanceof File) || !value.name) {
    throw new DraftRequestError(`${label} 파일을 선택해 주세요.`, 400);
  }
  if (!value.name.toLowerCase().endsWith(".txt")) {
    throw new DraftRequestError(`${label} 파일은 .txt 형식이어야 합니다.`, 400);
  }
  if (value.size > MAX_TEXT_FILE_BYTES) {
    throw new DraftRequestError(`${label} 파일은 2MB 이하여야 합니다.`, 413);
  }

  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(await value.arrayBuffer());
    return { filename: value.name, source };
  } catch {
    throw new DraftRequestError(`${label} 파일을 UTF-8로 저장한 뒤 다시 선택해 주세요.`, 400);
  }
}

export async function readLessonDraftImport(request: Request): Promise<LessonDraftImport> {
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!contentType.startsWith("multipart/form-data")) {
    throw new DraftRequestError("텍스트 파일을 포함한 폼 데이터가 필요합니다.", 415);
  }
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new DraftRequestError("가져오기 요청은 5MB 이하여야 합니다.", 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new DraftRequestError("가져오기 요청을 읽을 수 없습니다.", 400);
  }

  const title = readField(formData, "title");
  if (!title || title.length > 120) {
    throw new DraftRequestError("레슨 제목을 120자 이내로 입력해 주세요.", 400);
  }

  const language = readField(formData, "language");
  if (language !== "english" && language !== "japanese") {
    throw new DraftRequestError("지원하는 언어를 선택해 주세요.", 400);
  }

  const target = await readUtf8TextFile(formData, "targetFile", "목표어 텍스트");
  const korean = await readUtf8TextFile(formData, "koreanFile", "한국어 텍스트");
  const parseResult = parseLessonDraft(target.source, korean.source);

  return {
    title,
    language,
    targetFilename: target.filename,
    koreanFilename: korean.filename,
    targetSource: target.source,
    koreanSource: korean.source,
    parseResult
  };
}
