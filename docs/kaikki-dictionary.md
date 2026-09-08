# Korean dictionary lookup

The practice popup reads Korean meanings from an imported copy of Kaikki's **Korean Wiktionary edition**, with explicitly reviewed source supplements for extraction gaps. It queries the application's authenticated API; clicking a word does not contact an external dictionary or translate a definition with a model. It shows all stored meanings and uses of the selected word in the target language, grouped by part of speech; it does not select a sentence-specific sense.

## Source and attribution

- [Kaikki raw download catalogue](https://kaikki.org/dictionary/rawdata.html), verified 2026-09-07: [Korean-edition JSONL gzip](https://kaikki.org/dictionary/downloads/ko/ko-extract.jsonl.gz). The catalogue deprecates postprocessed downloads; this importer uses the raw file.
- [Kaikki Korean-edition provenance](https://kaikki.org/kowiktionary/) identifies Korean Wiktionary as the source, extracted using Wiktextract, with Wiktionary's licenses. [Korean Wiktionary copyright](https://ko.wiktionary.org/wiki/%EC%9C%84%ED%82%A4%EB%82%B1%EB%A7%90%EC%82%AC%EC%A0%84:%EC%A0%80%EC%9E%91%EA%B6%8C) identifies [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) for text reuse.
- Each stored entry retains a Korean Wiktionary page URL and `CC BY-SA 4.0`; each row records `source_dump`. Direct supplements use exact source revision URLs in both fields. The popup credits Korean Wiktionary contributors and Kaikki, links the original entries and license, and identifies the extracted content. The dictionary dataset's adaptation is distributed under CC BY-SA 4.0. This does not license the application's unrelated code under the dictionary license.
- Adaptations here comprise extracting selected languages, senses, examples, and IPA and normalizing lookup keys. Direct supplements remove source HTML markup and normalize whitespace while preserving the source's definition and usage text. No media is imported; audio/media licenses must be reviewed independently if added.

Attribution appears once in a shared popup footer rather than repeating below every entry. The **위키낱말사전 원문** link opens the first actual source URL. An expandable **출처 및 라이선스** section preserves additional unique source/revision URLs, contributor and Kaikki attribution, and the license link. It uses the existing Accordion primitive without another disclosure dependency.

## Import

Use Node 24, matching the project engine. The CLI uses Node's built-in TypeScript support for the shared normalization helper. A `MODULE_TYPELESS_PACKAGE_JSON` warning is harmless; do not change the application's package type just to suppress it.

First apply and test the `dictionary_entries` migration in the intended environment. The table is accessible only to the service role. The browser never receives `SUPABASE_SECRET_KEY`.

```sh
# Stream the official gzip; report counts without contacting the database.
node scripts/import-kaikki.mjs --dry-run

# Quick source-format check, stopping after 25 accepted entries.
node scripts/import-kaikki.mjs --dry-run --limit 25

# Inspect a previously downloaded snapshot. Plain .jsonl and .jsonl.gz are supported.
node scripts/import-kaikki.mjs --file /path/to/ko-extract.jsonl.gz --dry-run

# Explicitly write to the project selected by the existing .env.local.
node --env-file=.env.local scripts/import-kaikki.mjs \
  --file /path/to/ko-extract.jsonl.gz \
  --source-dump 'kaikki-kowiktionary-2026-09-01-extracted-2026-09-05' \
  --write
```

`--write` requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The script does not edit environment files. Use a source identifier verified for the actual snapshot; the dates above describe the edition page checked on 2026-09-07, not every future download. Without an explicit identifier, `source_dump` records the official download URL. Local file paths are not persisted automatically. No credentials or raw backend errors are logged.

The importer streams and decompresses JSONL, keeping one line and one upsert batch in memory, plus a compact headword/POS occurrence map for deterministic IDs. It accepts `en`, `ja`, `zh`, `es`, `de`, and `fr`; requires at least one nonempty gloss containing Hangul; preserves examples, available IPA, and explicit transitivity metadata; and skips entries outside those constraints. It indexes original headwords, valid `forms[].form` values, and explicit redirects. Romanization/transliteration forms and reverse `form_of` references are excluded. No guessed stemming, conjugation, or machine translation is added.

Rows are upserted in batches of 250 (`--batch-size 1..1000`). IDs derive from edition, language, original headword, POS, and the occurrence within repeated headword/POS records. Re-importing the same dump is idempotent; gloss changes keep IDs when the headword/POS ordering remains stable. A failure stops the run; earlier successful batches remain. Rerunning the same dump safely updates them. Syntax/JSON errors are fatal and include the line number without echoing the source line.

This CLI does not prune rows absent from a new dump and does not promise an atomic snapshot replacement. Reordering/removing homographs in a later dump can leave obsolete rows. For a complete refresh, use a separately reviewed staging-table replacement after checking the dry-run counts. `--limit` deliberately creates a partial import when combined with `--write`; use it for local smoke checks only. Do not commit downloaded dumps or real credentials.

The JSON summary reports read/accepted/skipped entries, senses, lookup-key count, per-language counts, written rows, and whether an explicit limit was reached. These counts describe accepted data, not a measure of coverage for registered passages or context-correct meanings.

## Repairing unheaded source definitions

Some Korean Wiktionary pages place a definition before their first part-of-speech heading. Kaikki's Korean extraction can omit that block even though the original page displays it. Verified examples on 2026-09-08 are [respect, revision 4365701](https://ko.wiktionary.org/w/index.php?title=respect&oldid=4365701), with two unheaded noun senses, and [individual, revision 4336969](https://ko.wiktionary.org/w/index.php?title=individual&oldid=4336969), with one unheaded adjective sense.

The separate maintenance command recovers this narrow pattern from MediaWiki's rendered source API. It requires an explicit language and 1–10 word/revision pairs. It only imports unheaded definition lists before the first subheading, within that language section, when source categories identify exactly one remaining POS after excluding headed POS. Ambiguous categories, nested definition lists, unexpected titles/revisions, and oversized data stop the import for manual review. It is not a general Wiktionary parser or an automatic claim of complete coverage.

Use Node 24 with the project's dev dependencies installed (`jsdom` parses HTML without running page scripts or loading resources). Review the full dry-run output before applying the same pinned pages:

```sh
node scripts/supplement-kowiktionary.mjs --language en \
  --page respect@4365701 --page individual@4336969 --dry-run

node --env-file=.env.local scripts/supplement-kowiktionary.mjs --language en \
  --page respect@4365701 --page individual@4336969 \
  --write --expect-project YOUR_SUPABASE_PROJECT_REF
```

The dry run contacts only Korean Wiktionary and prints the exact proposed rows; it does not contact Supabase. It can report zero recovered entries for a page. A write requires exactly one supplement for every explicitly requested page and a final row count matching the requested page count; an empty or unmatched page aborts the whole proposed repair before any database writer runs. The verified two-page dry run proposes two additional entries: `respect` noun (two senses and eight source usage/example lines), and `individual` adjective (one sense and one source example). Source text may contain a sentence and its Korean translation on the same line; this is preserved instead of guessing a split.

Writes require the loaded URL to exactly match `--expect-project`. They insert only absent `kowiktionary-supplement:` IDs, never overwrite original Kaikki rows or existing supplements, and verify the inserted content by reading it back. Repeating the same pinned revision is idempotent. A different revision for an existing supplement stops with a conflict and requires a separately reviewed update. Stable IDs derive from language, headword, the unheaded-block marker, and POS; the exact source revision remains in `source_dump` and `entry.sourceUrl`. No broad refresh, table migration, deletion, or pruning is performed. A future Kaikki snapshot may fill the original extraction gap; check for overlap with supplements when planning that separately reviewed refresh.

## API contract

`GET /api/dictionary?language=english&word=school` accepts full language names and ISO codes for the six imported languages. It first verifies both the signed beta invitation cookie and a Google learner session with `hasLearnerAccess`. All responses send `Cache-Control: private, no-store` and `Vary: Cookie`.

```ts
type DictionaryResponse = {
  word: string;
  entries: {
    headword: string;
    language: string; // en, ja, zh, es, de, fr
    pos: string;
    tags?: ("transitive" | "intransitive")[]; // Explicit entry-level source metadata only
    senses: {
      glosses: string[];
      examples?: { text: string; translation?: string }[];
      tags?: ("transitive" | "intransitive")[]; // Applies only to this source sense
    }[];
    pronunciations?: { ipa: string }[];
    sourceUrl: string;
    license: string;
    matchType?: "lemma"; // An additional base-form candidate
  }[];
};
```

| Response | Meaning |
| --- | --- |
| `200`, `entries: []` | No imported match for this language and normalized word |
| `400`, `invalid-dictionary-query` | Missing/duplicate parameters, unsupported language, invalid word, or over 80 Unicode code points |
| `401`, `unauthorized` | No valid learner access |
| `503`, `dictionary-unavailable` | Missing configuration, failed/timed-out storage query, or malformed stored entry |

Normalization uses NFKC, lowercase, apostrophe/dash normalization, and space cleanup while retaining diacritics. The query requires a letter; accepts Unicode letters/marks/numbers, spaces, lexical apostrophes/dashes, dots, and middle dots; and rejects controls and query metacharacters. The repository uses a language equality filter, indexed array containment/overlap, and stable 50-row pages under one five-second deadline. JSON decoding preserves all valid stored senses, glosses, examples, and IPA values without display-count truncation. Defensive limits are 256 entries, 1 MiB of serialized response entries, and 256 KiB per stored entry; exceeding a budget fails explicitly instead of presenting a shortened result as complete. Source URLs must match the exact headword's canonical page or the narrowly validated revision URL format.

English word selection keeps lexical hyphens together (`ex-girlfriend`, `state-of-the-art`, and Unicode hyphen variants), while spaces, sentence dashes, and doubled hyphens stay separate. Japanese segmentation and hidden-subtitle rules are unchanged.

English lookup first checks the selected word and imported form aliases. [wink-lemmatizer](https://github.com/winkjs/wink-lemmatizer), an MIT-licensed implementation based on WordNet morphology, supplies up to three base candidates for verbs, nouns, and adjectives when no direct match exists. Examples include `passed → pass`, `went → go`, `children → child`, and `better → good`. An existing compatible POS (or unspecified POS) establishes that a guessed base is plausible; after resolution, **all stored parts of speech of that headword** are returned. Indexed array-overlap queries resolve candidates under the same deadline; they make no Google API call. The English morphology data stays in the server bundle.

When a direct entry exists, additional verb and adjective interpretations can still appear (for example, `saw` plus `see`, or the noun `better` plus the adjective `good`), but noun stemming does not replace existing words such as `boss`. If an imported form alias finds only one POS of a headword, a required expansion retrieves its remaining POS and deduplicates identical entries. Guessed expansions add `matchType: "lemma"`; the popup identifies them as an **원형 후보** because no sentence context disambiguation is performed. A storage failure in an optional guessed expansion preserves valid direct results; a required alias expansion or exceeded resource budget fails explicitly. Hyphenated inflections retain their complete prefix (`ex-girlfriends → ex-girlfriend`), and a compound absent from Kaikki is not substituted with a component word.

Coverage varies by word, language, inflection, and sense. A matching headword does not establish that the definition fits the current sentence. Japanese/Chinese tokenization may also select a span absent from this edition. Missing glosses remain an explicit empty result.

## Explicit transitivity metadata

`DictionaryEntry.tags` and `DictionarySense.tags` optionally preserve only `transitive` and `intransitive`. The importer reads exact normalized values from source `tags`/`raw_tags` arrays and maps the exact Korean `raw_tags` values `타동사` and `자동사` to those two values. Unknown tags are ignored, duplicates are removed, and absent metadata remains absent. Sense tags stay attached to their own sense; they are not promoted to the whole entry. The decoder passes only these two normalized values through the API. Neither importer nor decoder examines example sentences or definitions to infer transitivity.

The popup shows **타동사** and **자동사** badges only for those explicit API values: entry metadata beside its POS, and sense metadata beside the corresponding definition, without repeating a tag already shown for that entry. Plain `verb` remains **동사** when the source provides neither tag.

On 2026-09-08, the [official raw Korean dump](https://kaikki.org/dictionary/downloads/ko/ko-extract.jsonl.gz) and the saved snapshot with SHA-256 `d8840195292ec6de514058439f75abb13189761466172819a88969ba0cb6001e` both contained three English `pass` records: an untagged noun, a verb with entry `tags: ["intransitive"]` and `pos_title: "자동사"`, and another verb with entry `tags: ["transitive"]` and `pos_title: "타동사"`. Their senses do not carry transitivity tags. The same snapshot's `bear` verb instead carries distinct intransitive/transitive tags on individual senses. This matches Wiktextract's Korean [section-heading mapping](https://github.com/tatuylonen/wiktextract/blob/master/src/wiktextract/extractor/ko/section_titles.py), [gloss-label mapping](https://github.com/tatuylonen/wiktextract/blob/master/src/wiktextract/extractor/ko/tags.py), and [entry/sense models](https://github.com/tatuylonen/wiktextract/blob/master/src/wiktextract/extractor/ko/models.py).

Older imports omitted these fields. A code change alone cannot restore metadata in already stored rows. For a targeted backfill, first verify the saved source file's hash against `source_dump`, reproduce occurrence-based IDs with the importer, and require that the mapped entry with tags removed exactly equals the stored entry and that lookup keys match. Only then may a reviewed transaction add the explicit `entry.tags` or corresponding sense tags, guarded by exact IDs, language, headword, provenance, and the full original entry, with a checked expected row count. Preserve every existing definition, example, source field, and unrelated row. Verify readback and repeat lookup through the authenticated API. Do not run a global reimport merely to restore tags for a demonstrated word.

On 2026-09-08, this guarded repair added only the explicit tags to the two existing English `pass` verb rows in the configured application database. Readback confirmed both values; the noun and all definitions, examples, lookup keys, and provenance were unchanged. The authenticated `passed` lookup and rendered popup showed both **자동사** and **타동사**. Other older rows were not backfilled; their missing tags still require a separately verified repair or reimport.

## Verification

```sh
node node_modules/vitest/vitest.mjs run \
  src/lib/dictionary.test.ts \
  src/lib/dictionary-lemmas.test.ts \
  src/lib/dictionary-import.test.ts \
  src/lib/dictionary-supplement.test.ts \
  src/lib/dictionary-repository.test.ts \
  src/app/api/dictionary/route.test.ts \
  src/app/player/dictionary-words.test.tsx \
  src/app/player/dictionary-popup.test.tsx
```

Tests cover source mapping and skipped rows, explicit entry/sense transitivity and absent/unknown metadata, stable IDs and homographs, split UTF-8/JSONL streaming, local gzip CLI execution, dry-run safety, pinned revisions, language isolation and ambiguous-source rejection, attribution validation, complete meanings across old truncation limits and storage pages, resource-budget failures, learner authorization, failure/no-match separation, and the private indexed query. Run database access tests and an actual imported-word lookup against the intended database separately; unit mocks do not prove that the migration or hosted environment is configured.

The 2026-09-07 full source check downloaded 25,836,438 compressed bytes with SHA-256 `d8840195292ec6de514058439f75abb13189761466172819a88969ba0cb6001e`. Both the remote stream and saved-file dry runs read 356,160 records, accepted 62,778 entries containing 74,258 senses, and produced 64,743 lookup keys. Accepted entries by language: English 16,600; Japanese 13,115; Chinese 17,371; Spanish 5,042; German 4,859; French 5,791. These dry runs wrote no database rows. Future snapshots can differ.

After schema verification, the same snapshot was imported into the configured application database: 62,778 rows, about 48 MiB including indexes. Authenticated server-route checks returned three English `open` entries and one Japanese `学校` entry with Korean glosses. An unauthenticated request returned 401, and direct browser-role table reads remained denied.
