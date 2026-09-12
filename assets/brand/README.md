# 쇄도잉 brand assets

Originals supplied by the project owner on 2026-09-11. The original icon and logo
remain unchanged. The full-bleed derivative was prepared on 2026-09-12 with the
built-in image-editing tool; it is not a pixel-identical crop of the original.

| File | Purpose | Dimensions | SHA-256 |
| --- | --- | --- | --- |
| logo.png | Full logo, displayed uncropped on a white plate | 1774 × 887 | 96c51d83a603274e5d22d6ac58ff8d4341847509951b73336b75c8be9fa456fe |
| app-icon.png | Prototype app icon | 1254 × 1254 | 0b152eaab16e00c8b307f9e9a40299d707942cd5c84c747bad1d98c894359aff |
| app-icon-full-bleed.png | Installed full-bleed icon, opaque RGB | 1254 × 1254 | 3c568736d65352d67b4bb1a63ae1928979027579b422409e0e1d99ee7beefd0d |

The original icon includes transparency and rounded corners. The installed
derivative extends the yellow-orange background to the square edges, with no
white margin or alpha. iOS supplies its own corner mask; Expo generates the
1024-point icon rendition during prebuild. App Store submission remains separate.

The native launch screen uses the original `logo.png`, centered and contained at
320 points wide on white, including in dark appearance. It remains visible until
fonts finish loading (or fail, allowing the system-font fallback). No artificial
loading delay is added.

## Icon editing prompt

Built-in image-edit mode, with `app-icon.png` as the sole edit target:

> Make a production iOS full-bleed square icon version: remove all outer
> transparent/black padding and extend its existing yellow-at-top to
> orange-at-bottom background to all four square edges and corners, fully
> opaque. No rounded corner mask, white border, external shadow or inset.
> Preserve the white fluffy character, brown outlines, orange headphones, face,
> book, pose, proportions and illustration style as faithfully as possible;
> do not redesign or add anything, no text. Zoom only enough to remove the
> outside margin; keep the character and book entirely visible. Output square
> 1024×1024 PNG. Background/padding correction only.

The tool returned 1254×1254; Expo performs the native output sizing.

Display name: 쇄도잉. Existing bundle identifier, URL scheme, package identifiers
and local records remain unchanged by this branding update.

`mascot.png` is the owner's transparent 1254 × 1254 mascot attachment supplied
on 2026-09-12, preserved byte-for-byte with no redraw or background. It appears
in its original colors as an inert 36-point item at the left of the browsing bar.
