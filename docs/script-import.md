# Script and audio import

The administrator uploads **one UTF-8 `.txt` file** containing both languages, plus multiple audio files. Separate target-language and Korean TXT uploads are no longer offered. Existing saved lessons remain readable without conversion.

## TXT format

Write the English or Japanese text first, followed by its Korean translation. Consecutive target-language lines and the following consecutive Korean lines make **one phrase**. Punctuation does not split phrases, and line breaks inside each language block are preserved.

```text
## Section 1

Open the window.
창문을 열어 주세요.

"Is it cold?"
"A little."
"추워요?"
"조금요."
```

This example contains one chapter and two phrases. The dialogue is one phrase, not two.

- Empty or whitespace-only lines are ignored, even between a target block and its translation. They do not create unnamed sections.
- Start a chapter with `## ` at the very beginning of a line, followed by a nonempty title. A chapter needs no translation or audio and separates practice groups.
- Each translation line must contain Hangul. English and Japanese target lines must not contain Hangul. A translation written only as `OK!`, or a target line containing Korean, is ambiguous; reword it to follow this rule and check the preview.
- A standalone number or punctuation-only line cannot be classified. Attach it to the appropriate language's sentence line.
- A missing language block or empty chapter title is reported with its source line and prevents publication. Because consecutive same-language lines intentionally form a block, the parser cannot detect every omitted translation; always verify phrase and audio alignment in the preview.
- Japanese may use explicitly supplied word spaces or automatic word segmentation. Each line of a multiline phrase follows the same tokenization rules.
- Maximum TXT size: 2 MiB. UTF-8 BOM and Windows/macOS line endings are accepted.

## Audio files

Select one MP3, M4A, or WebM **per phrase**, including multiline phrases. Use three-digit numbers beginning with `001`, for example `001-window.mp3` and `002-dialogue.mp3`. Chapter titles and blank lines do not use numbers. Each audio file may be at most 4 MiB.

After selecting the TXT and audio files, choose **파일 검증**, review the phrase text and numbered audio mapping, then **초안 저장** and **음성 업로드 후 게시**. Changing the TXT clears its previous preview and saved-draft association, including a validation result still in flight.

## Stored-data compatibility

The upload API uses the multipart field `scriptFile`. Existing draft columns are retained: both filename columns refer to the one uploaded filename, `target_source` holds the original combined source, and `korean_source` is empty. `parsed_entries` remains the shared publication and playback contract. Older two-file lessons retain their original entries and chapter/section boundaries; they are not re-parsed or migrated.
