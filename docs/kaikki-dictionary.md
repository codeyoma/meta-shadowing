# Korean dictionary lookup

The practice popup reads Korean meanings from an imported copy of Kaikki's **Korean Wiktionary edition**. It queries the application's authenticated API; clicking a word does not contact an external dictionary or translate a definition with a model.

## Source and attribution

- [Kaikki raw download catalogue](https://kaikki.org/dictionary/rawdata.html), verified 2026-09-07: [Korean-edition JSONL gzip](https://kaikki.org/dictionary/downloads/ko/ko-extract.jsonl.gz). The catalogue deprecates postprocessed downloads; this importer uses the raw file.
- [Kaikki Korean-edition provenance](https://kaikki.org/kowiktionary/) identifies Korean Wiktionary as the source, extracted using Wiktextract, with Wiktionary's licenses. [Korean Wiktionary copyright](https://ko.wiktionary.org/wiki/%EC%9C%84%ED%82%A4%EB%82%B1%EB%A7%90%EC%82%AC%EC%A0%84:%EC%A0%80%EC%9E%91%EA%B6%8C) identifies [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) for text reuse.
- Each stored entry retains a Korean Wiktionary page URL and `CC BY-SA 4.0`; each row records `source_dump`. The popup credits Korean Wiktionary contributors and Kaikki, links the original entry and license, and identifies the extracted content. The dictionary dataset's adaptation is distributed under CC BY-SA 4.0. This does not license the application's unrelated code under the dictionary license.
- Adaptations here comprise extracting selected languages, senses, examples, and IPA, normalizing lookup keys, and limiting popup output. No media is imported; audio/media licenses must be reviewed independently if added.

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

The importer streams and decompresses JSONL, keeping one line and one upsert batch in memory, plus a compact headword/POS occurrence map for deterministic IDs. It accepts `en`, `ja`, `zh`, `es`, `de`, and `fr`; requires at least one nonempty gloss containing Hangul; preserves examples and available IPA; and skips entries outside those constraints. It indexes original headwords, valid `forms[].form` values, and explicit redirects. Romanization/transliteration forms and reverse `form_of` references are excluded. No guessed stemming, conjugation, or machine translation is added.

Rows are upserted in batches of 250 (`--batch-size 1..1000`). IDs derive from edition, language, original headword, POS, and the occurrence within repeated headword/POS records. Re-importing the same dump is idempotent; gloss changes keep IDs when the headword/POS ordering remains stable. A failure stops the run; earlier successful batches remain. Rerunning the same dump safely updates them. Syntax/JSON errors are fatal and include the line number without echoing the source line.

This CLI does not prune rows absent from a new dump and does not promise an atomic snapshot replacement. Reordering/removing homographs in a later dump can leave obsolete rows. For a complete refresh, use a separately reviewed staging-table replacement after checking the dry-run counts. `--limit` deliberately creates a partial import when combined with `--write`; use it for local smoke checks only. Do not commit downloaded dumps or real credentials.

The JSON summary reports read/accepted/skipped entries, senses, lookup-key count, per-language counts, written rows, and whether an explicit limit was reached. These counts describe accepted data, not a measure of coverage for registered passages or context-correct meanings.

## API contract

`GET /api/dictionary?language=english&word=school` accepts full language names and ISO codes for the six imported languages. It first verifies the signed learner cookie with `hasLearnerAccess`. All responses send `Cache-Control: private, no-store` and `Vary: Cookie`.

```ts
type DictionaryResponse = {
  word: string;
  entries: {
    headword: string;
    language: string; // en, ja, zh, es, de, fr
    pos: string;
    senses: { glosses: string[]; examples?: { text: string; translation?: string }[] }[];
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

Normalization uses NFKC, lowercase, apostrophe/dash normalization, and space cleanup while retaining diacritics. The query requires a letter; accepts Unicode letters/marks/numbers, spaces, lexical apostrophes/dashes, dots, and middle dots; and rejects controls and query metacharacters. The repository uses a language equality filter and indexed array containment, a five-second lookup budget, and a 12-entry response limit. JSON decoding preserves only the public contract and bounds each entry to 32 senses, eight glosses per sense, four examples per sense, and eight IPA values. The source-page link provides access to longer originals.

English word selection keeps lexical hyphens together (`ex-girlfriend`, `state-of-the-art`, and Unicode hyphen variants), while spaces, sentence dashes, and doubled hyphens stay separate. Japanese segmentation and hidden-subtitle rules are unchanged.

English lookup first checks the selected word and imported form aliases. [wink-lemmatizer](https://github.com/winkjs/wink-lemmatizer), an MIT-licensed implementation based on WordNet morphology, supplies up to three base candidates for verbs, nouns, and adjectives when no direct match exists. Examples include `passed → pass`, `went → go`, `children → child`, and `better → good`. Only existing dictionary entries with a compatible part of speech (or unspecified POS) are returned. A second indexed array-overlap query resolves all candidates under the same request deadline; it makes no Google API call. The English morphology data stays in the server bundle.

When a direct entry exists, additional verb and adjective interpretations can still appear (for example, `saw` plus `see`, or the noun `better` plus the adjective `good`), but noun stemming does not replace existing words such as `boss`. Existing form aliases are not queried again. Expanded entries add `matchType: "lemma"`; the popup labels the selected form and base as an **원형 후보** because no sentence context disambiguation is performed at this stage. An unavailable optional expansion never hides valid direct results. Hyphenated inflections retain their complete prefix (`ex-girlfriends → ex-girlfriend`), and a compound absent from Kaikki is not substituted with a component word.

Coverage varies by word, language, inflection, and sense. A matching headword does not establish that the definition fits the current sentence. Japanese/Chinese tokenization may also select a span absent from this edition. Missing glosses remain an explicit empty result.

## Verification

```sh
node node_modules/vitest/vitest.mjs run \
  src/lib/dictionary.test.ts \
  src/lib/dictionary-lemmas.test.ts \
  src/lib/dictionary-import.test.ts \
  src/lib/dictionary-repository.test.ts \
  src/app/api/dictionary/route.test.ts \
  src/app/player/dictionary-words.test.tsx \
  src/app/player/dictionary-popup.test.tsx
```

Tests cover source mapping and skipped rows, stable IDs and homographs, split UTF-8/JSONL streaming, local gzip CLI execution, dry-run safety, language/Unicode bounds, attribution validation, response bounds, learner authorization, failure/no-match separation, and the private indexed query. Run database access tests and an actual imported-word lookup against the intended database separately; unit mocks do not prove that the migration or hosted environment is configured.

The 2026-09-07 full source check downloaded 25,836,438 compressed bytes with SHA-256 `d8840195292ec6de514058439f75abb13189761466172819a88969ba0cb6001e`. Both the remote stream and saved-file dry runs read 356,160 records, accepted 62,778 entries containing 74,258 senses, and produced 64,743 lookup keys. Accepted entries by language: English 16,600; Japanese 13,115; Chinese 17,371; Spanish 5,042; German 4,859; French 5,791. These dry runs wrote no database rows. Future snapshots can differ.

After schema verification, the same snapshot was imported into the configured application database: 62,778 rows, about 48 MiB including indexes. Authenticated server-route checks returned three English `open` entries and one Japanese `学校` entry with Korean glosses. An unauthenticated request returned 401, and direct browser-role table reads remained denied.
