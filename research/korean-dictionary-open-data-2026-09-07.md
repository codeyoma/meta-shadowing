# Open data and APIs for foreign-word → Korean lookup

Checked 2026-09-07. Scope: English, Japanese, Chinese, Spanish, German and French headwords; Korean definitions inside a learning app. No accounts were created and no applications or messages were sent.

## Recommendation

**WiktAPI is a newly verified, free, keyless way to retrieve actual Korean glosses.** Its Korean Wiktionary edition can be queried with the headword language separately specified. However, sense coverage is uneven, and live Unicode-path lookups failed despite successful prefix searches. Use it for a bounded Latin-script prototype; for reliable ingestion/storage across all six languages, import Kaikki's Korean edition into a small local database and serve an API you control. This is an engineering recommendation based on the live checks below, not an assertion that open data equals a complete commercial learner's dictionary.

KRDICT is a second useful open dataset, especially for Korean semantic definitions, but its dictionary direction is Korean → foreign languages. Reversing its translation fields can supply candidate Korean equivalents, not a complete foreign-language dictionary.

## WiktAPI: live API with Korean glosses

- [Official quickstart](https://wiktapi.dev/quickstart): no API key required. [About](https://wiktapi.dev/about) describes the project as free/open source. No explicit public-host quota or service-level commitment was found in the reviewed docs; do not represent it as a guaranteed unlimited service.
- [Edition/language documentation](https://wiktapi.dev/concepts/editions): `/v1/{edition}/word/{word}?lang={language}`; edition determines the language of the definitions, while `lang` filters the headword language.
- Live [edition listing](https://api.wiktapi.dev/v1/editions) returned HTTP 200 and included `ko` among 21 editions.
- Example [open → Korean JSON](https://api.wiktapi.dev/v1/ko/word/open?lang=en). `ko` is the Korean Wiktionary edition; `en` is the English headword language.
- [Software license](https://github.com/TheAlexLichter/wiktionary-api/blob/main/LICENSE) is MIT. **Dictionary data is separately licensed Wiktionary content**, not MIT. [Kaikki provenance/license](https://kaikki.org/kowiktionary/) identifies Wiktionary and CC BY-SA/GFDL; [Wiktionary copyright](https://en.wiktionary.org/wiki/Wiktionary:Copyrights) identifies CC BY-SA 4.0 for original text, with separate conditions for external/media material. Preserve source links, attribution and adaptation licensing obligations.
- [Data pipeline](https://wiktapi.dev/concepts/data-pipeline) describes importing Kaikki JSONL into SQLite and caching responses. [Self-hosting](https://wiktapi.dev/guides/self-hosting) supports importing additional editions. Hosting has your own operational cost even when source and data are free.

### Actual lookup results

Small illustrative sample, not a corpus coverage benchmark. Requests used ordinary HTTP GET with `User-Agent: Mozilla/5.0`; Python urllib's default user agent received 403 in this environment.

| Headword / language | Live result | Practical implication |
|---|---|---|
| `open` / English | 200, Korean verb senses including opening/starting | Works for basic click lookup; no complete adjective coverage established |
| `fair` / English | 200, noun meanings about a market/festival/exhibition | Missing the adjective sense needed for “You should be fair…” |
| `justo` / Spanish | 200, brief Korean senses about correctness/accuracy | Usable short glosses, not a complete learner's entry |
| `gerecht` / German | 200, Korean gloss describing moral/legal/social fairness | Relevant adjective sense present |
| `juste` / French | 200, adverb and noun entries | Adjective fairness sense missing in this result |
| `学校` / Japanese | 404 for encoded word path; prefix search finds the Japanese noun | Lookup transport/decoding problem, not proof the dictionary lacks it |
| `公平` / Chinese | 404 for encoded word path; prefix search finds the Chinese entry with `pos: unknown` | Same transport issue plus extraction quality limits |

Test URLs:

```text
https://api.wiktapi.dev/v1/ko/word/open?lang=en
https://api.wiktapi.dev/v1/ko/word/fair?lang=en
https://api.wiktapi.dev/v1/ko/word/justo?lang=es
https://api.wiktapi.dev/v1/ko/word/gerecht?lang=de
https://api.wiktapi.dev/v1/ko/word/juste?lang=fr
https://api.wiktapi.dev/v1/ko/word/%E5%AD%A6%E6%A0%A1?lang=ja
https://api.wiktapi.dev/v1/ko/word/%E5%85%AC%E5%B9%B3?lang=zh
https://api.wiktapi.dev/v1/ko/search?q=%E5%AD%A6%E6%A0%A1&lang=ja
https://api.wiktapi.dev/v1/ko/search?q=%E5%85%AC%E5%B9%B3&lang=zh
```

The Japanese 404 message said `No entries found for "%E5%AD%A6%E6%A0%A1"`, retaining the percent encoding. Prefix search returned `{"word":"学校","lang_code":"ja","lang":"일본어","pos":"noun"}`. **Search only returns headword metadata, not definitions, so it is not a working substitute for the failed lookup.** Encoded `猫`, `你好`, and `人` lookups also failed; an English-edition Japanese lookup failed in the same way. This strongly suggests a route parameter decoding bug. [Current route source](https://github.com/TheAlexLichter/wiktionary-api/blob/main/packages/api/routes/v1/%5Bedition%5D/word/%5Bword%5D.get.ts) passes `getRouterParam(event, "word")` straight into the database query. No fix was implemented or upstream issue posted in this research. Streaming the official Japanese/Chinese Kaikki download samples separately confirmed real Korean glosses: Japanese `学校` has `학교; 학원`, `猫` has `고양이`; Chinese `公平` has `공평한, 공정한`, and `你好` has `안녕하세요, 안녕`. The downloadable data therefore remains useful even where this hosted API lookup fails.

The full-entry response currently contains `senses`, `sounds`, `translations`, and `forms`, but does not include `pos` or `lang_code` inside each returned entry. The [`definitions` route source](https://github.com/TheAlexLichter/wiktionary-api/blob/main/packages/api/routes/v1/%5Bedition%5D/word/%5Bword%5D/definitions.get.ts) does expose those fields. Do not assume the documented “full raw entry” includes every source property.

## Kaikki Korean edition: reusable source data

[The Korean edition](https://kaikki.org/kowiktionary/) reports these sense counts for its 2026-09-01 Wiktionary dump, extracted 2026-09-05:

| Headword language | Senses in Korean edition |
|---|---:|
| English | 22,855 |
| Japanese | 15,256 |
| Chinese | 22,915 |
| Spanish | 5,530 |
| German | 7,756 |
| French | 6,549 |

These are **senses, not unique headwords or guaranteed useful learner definitions**. The [Japanese dictionary page](https://kaikki.org/kowiktionary/%EC%9D%BC%EB%B3%B8%EC%96%B4/index.html) reports 12,720 distinct word forms; the [Chinese page](https://kaikki.org/kowiktionary/%EC%A4%91%EA%B5%AD%EC%96%B4/index.html) reports 18,310 forms and many unknown part-of-speech senses.

[Official raw downloads](https://kaikki.org/dictionary/rawdata.html) list Korean `ko-extract.jsonl` (~183 MB) and compressed `ko-extract.jsonl.gz` (~24.6 MB). The per-language postprocessed files are explicitly deprecated; start new ingestion from the raw Korean edition, filter `lang_code` to the six headword languages, and retain source/provenance alongside the entry. The default English edition has much more data, but its definitions are English; merely finding Korean translations there does not make it a Korean-definition dictionary.

## KRDICT / National Institute of Korean Language

[Official API documentation](https://krdict.korean.go.kr/kor/openApi/openApiInfo) provides free key-based search/view XML, Korean headwords, Korean meanings, and translations of headwords/definitions. Its documented daily limit is 50,000 calls. Supported translations include English (1), Japanese (2), French (3), Spanish (4), and Chinese (11); **German is absent**. The `lang` parameter used with original-language search means the origin of a Korean loanword, not arbitrary foreign→Korean dictionary lookup.

[Official complete-download window](https://krdict.korean.go.kr/download/downloadPopup) currently advertises August 2026 Excel, XML and JSON snapshots. Download buttons are present without login. The page's JSON button points to `/dicBatchDownload?seq=214`; this sequence is a dated snapshot identifier and should be rediscovered from the download page rather than permanently hard-coded. A live request confirmed HTTP 200, ZIP content and an 84,455,509-byte archive named for 2026-08-19. The full archive was not downloaded or ingested in this research, so inclusion of every API translation field in the current archive remains to be checked before selecting the reverse-index route.

Potential use: index foreign `trans_word` values from available bilingual data back to the Korean `word` and sense. This supplies candidates such as a foreign translation of a Korean entry; it does not establish all senses, pronunciation, inflections or foreign-language example usage of the foreign word. A reverse match may also be a multiword paraphrase, requiring curation.

[Current copyright policy](https://krdict.korean.go.kr/kor/kboardPolicy/copyRightTermsInfo) explicitly permits commercial reuse of material not otherwise marked under **CC BY-SA 2.0 Korea**, with attribution and share-alike for adaptations. Audio, pronunciation recordings, images and other multimedia can have individually different commercial/adaptation permissions.

## Lower-priority sources and false matches

| Source | Finding | Fit for this app |
|---|---|---|
| [FreeDict downloads](https://freedict.org/downloads/) | Current download catalogue contains no Korean entry (checked rendered text and live HTML) | Do not recommend as the six-language→Korean source merely because it offers many language pairs |
| [PanLex](https://panlex.org/) / [data license](https://panlex.org/license/) | Lexical translation database; published snapshots licensed CC0, including commercial use. Legacy developer API page rendered its generic homepage, and old snapshot page pointed to a current URL that likewise rendered the main site | Potential lexical-equivalent research input; live API onboarding and current downloadable path were not verified, so not a ready implementation recommendation |
| [Wikidata Lexicographical data](https://www.wikidata.org/wiki/Wikidata:Lexicographical_data) / [licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) | Structured lexemes/forms/senses under CC0; this does not imply six-language Korean gloss coverage | Useful linked semantic metadata; Korean definition completeness not verified, so not a replacement dictionary recommendation |
| [JMdict/EDRDG](https://www.edrdg.org/wiki/Main_Page.html) | Official full-gloss language list includes English/German/French/Russian/Spanish/Hungarian/Slovenian/Dutch; Korean is not listed | Strong Japanese lexical source if translating licensed glosses separately, not a ready Japanese→Korean dictionary |
| [wooorm/nspell](https://github.com/wooorm/nspell) and its dictionary packages | Hunspell spelling dictionaries: words plus affix flags | Spelling support, not meanings or bilingual definitions |
| StarDict/GoldenDict files found through mirrors | File format/reader availability does not identify a reusable license for the contents | Verify the original dictionary's rights before reuse; an uploaded bilingual file is not evidence of public redistribution permission |

## Practical next step

Prepare a representative sample of the actual registered passages and evaluate unique `(language, lemma, part_of_speech)` entries against Korean Kaikki data. Count missing words **and missing context-appropriate senses**, using `fair` as an example of why an HTTP 200 hit rate is insufficient. Preserve approved open-source dictionary material in the app's own data store, curate missing Korean explanations for those specific passages, and retain a source link when a full external dictionary entry is needed. This fits a curated-content app better than coupling every click to a fragile public HTML parser.
