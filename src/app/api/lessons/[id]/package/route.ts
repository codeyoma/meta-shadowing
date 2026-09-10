import { createHash } from "node:crypto";
import { hasBetaAccess } from "@/lib/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPublishedAudioDescriptor, UnverifiedPublicationError } from "@/lib/published-audio-descriptor";
import { getPublishedLesson } from "@/lib/published-lessons";
import { getPublishedPhraseSyntax } from "@/lib/published-syntax";
import { lookupDictionaryEntries } from "@/lib/dictionary-repository";
import { parseDictionaryLanguage } from "@/lib/dictionary";
import { packageWords, packageLookupKey, validPackageWord, type LessonPackage } from "@/lib/lesson-package";
import { firstPracticeToken } from "@/lib/practice-tokens";
import { prepareRapidLines } from "@/lib/rapid-lines";
import { dialogueTurns } from "@/lib/dialogue-turns";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
    // 32 MiB is the aggregate text/dictionary/analysis limit, separate from audio.
    // Exceeding it fails acquisition explicitly; required entries are never omitted.
    let remainingBytes = 32 * 1024 * 1024;
    const budget = (value: unknown) => {
      signal.throwIfAborted();
      remainingBytes -= Buffer.byteLength(JSON.stringify(value), "utf8");
      if (remainingBytes < 0) throw new Error("Complete package data exceeds storage budget");
    };
    if (!(await hasBetaAccess())) return Response.json({ error: "unauthorized" }, { status: 401, headers });
    const client = await createServerSupabaseClient();
    if (!client) throw new Error("Authentication unavailable");
    const verified = await client.auth.getUser();
    if (verified.error && (!verified.error.status || verified.error.status >= 500 || verified.error.name === "AuthRetryableFetchError")) throw new Error("Authentication temporarily unavailable");
    const identity = verified.data.user;
    const metadata = identity?.app_metadata;
    const hasGoogle = metadata?.provider === "google" || (Array.isArray(metadata?.providers) && metadata.providers.includes("google"));
    if (verified.error || !identity || identity.is_anonymous || !hasGoogle) return Response.json({ error: "unauthorized" }, { status: 401, headers });
    const { id } = await context.params;
    const query = new URL(request.url).searchParams;
    const version = query.get("version");
    if (!/^[0-9a-f-]{36}$/i.test(id) || query.getAll("version").length !== 1 || !version || !Number.isFinite(Date.parse(version))) {
      return Response.json({ error: "publication-not-found" }, { status: 404, headers });
    }
    const descriptor = await getPublishedAudioDescriptor(id, version);
    const lesson = await getPublishedLesson(id);
    if (!descriptor || !lesson || lesson.version !== version) return Response.json({ error: "publication-not-found" }, { status: 404, headers });
    const language = parseDictionaryLanguage(lesson.language);
    if (!language) throw new Error("Unsupported dictionary language");
    budget(lesson); budget(descriptor.audio);
    const syntax: LessonPackage["syntax"] = [];
    const words: LessonPackage["words"] = Object.create(null);
    const hints = lesson.phrases.map(phrase => ({ target: firstPracticeToken(phrase.target, lesson.language), korean: firstPracticeToken(phrase.korean, "korean") }));
    const lines = prepareRapidLines(lesson.entries, lesson.language);
    budget(hints); budget(lines);
    const addWords = (text: string) => {
      if (Object.hasOwn(words, text)) return;
      const segments = packageWords(text, lesson.language);
      // Account incrementally, including cumulative variants, before retaining data.
      budget({ [text]: segments });
      words[text] = segments;
    };
    for (const phrase of [...lesson.phrases, ...hints]) {
      addWords(phrase.target);
      for (const turn of dialogueTurns(phrase) ?? []) addWords(turn.target);
    }
    for (const line of lines) for (const [index, token] of line.target.entries()) {
      addWords(token);
      addWords(line.target.slice(0, index + 1).join(" "));
    }
    const keys = new Set<string>();
    // Bound server work, and keep a failed required query distinct from absence.
    for (let offset = 0; offset < lesson.phrases.length; offset += 4) {
      signal.throwIfAborted();
      const results = await Promise.all(lesson.phrases.slice(offset, offset + 4).map(async phrase => {
        const result = await getPublishedPhraseSyntax(id, phrase.phraseNumber, version, signal);
        return { ...result, status: result.sentences.length && result.sentences.every(sentence => sentence.status === "complete") ? "available" as const : "unavailable" as const };
      }));
      budget(results); syntax.push(...results);
    }
    for (const segments of Object.values(words)) for (const word of segments) if (word.isWordLike && validPackageWord(word.segment)) keys.add(packageLookupKey(word.segment));
    for (const phrase of syntax) for (const sentence of phrase.sentences) for (const token of sentence.tokens) {
      for (const word of [token.text.content, token.lemma]) if (validPackageWord(word)) keys.add(packageLookupKey(word));
    }
    const dictionary: LessonPackage["dictionary"] = Object.create(null);
    const allKeys = [...keys].sort();
    for (let offset = 0; offset < allKeys.length; offset += 4) {
      signal.throwIfAborted();
      const results = await Promise.all(allKeys.slice(offset, offset + 4).map(async word => {
        const entries = await lookupDictionaryEntries(language, word, { strict: true, signal });
        return [word, { status: entries.length ? "available" as const : "unavailable" as const, entries }] as const;
      }));
      budget(results);
      // Stable insertion order, regardless of database response scheduling.
      for (const [word, entry] of results) dictionary[word] = entry;
    }
    // A replacement or withdrawal while assembling cannot yield mixed content.
    if ((await getPublishedLesson(id))?.version !== version) return Response.json({ error: "publication-not-found" }, { status: 404, headers });
    const manifest: LessonPackage = { schemaVersion: 1, lesson, audio: descriptor.audio, dictionary, syntax, words, hints, lines };
    const sha256 = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
    return Response.json({ accountId: identity.id, manifest, sha256 }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof UnverifiedPublicationError ? "publication-requires-replacement" : "package-unavailable" },
      { status: error instanceof UnverifiedPublicationError ? 409 : 503, headers });
  }
}
