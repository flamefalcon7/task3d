# Tusk3D Brand Assets

**Decision**: D-095 · **Visual system**: `docs/ux/design-tokens.md` (D-044)

Low-poly wireframe tusk. Concept: tusk = Walrus-track homage; faceted wireframe = the product itself (low-poly, manifold mesh). Black ink + exactly one `--accent` facet, per the brutalist editorial system.

## Asset inventory

| File | Use |
|---|---|
| `tusk3d-logo.svg` | **Primary asset.** Web, deck, any size. Black strokes `#000000`, accent facet `#FF4500`, transparent bg |
| `tusk3d-logo-inverse.svg` | White strokes, for `--well` (pure black) surfaces |
| `tusk3d-logo-transparent.png` | 1255×1255 raster master, transparent bg, colors normalized to tokens |
| `tusk3d-logo-512.png` | og-image composition, large raster needs |
| `tusk3d-logo-180.png` | apple-touch-icon |
| `tusk3d-logo-64.png` | Nav @2x (~32px display) |
| `tusk3d-logo-32.png` | Favicon |
| `tusk3d-logo-inverse.png` | White-stroke raster for dark surfaces |
| `tusk3d-logo-source.png` | Raw Nano Banana output, 2048², source of record |

**Wordmark is never baked into images.** Set "Tusk3D" in **Newsreader Italic 500, letter-spacing −1px** (nav brand spec, design-tokens §6).

## Generation prompt (Nano Banana / Gemini image)

```
A flat, minimalist logo symbol: a single walrus tusk built from straight
line segments as a low-poly faceted form — sharp angular facets, hard
vertices, no smooth curves. Solid black (#000000) uniform-weight strokes
on an off-white paper background (#F5F5F0). Brutalist editorial style,
like a stamp in a printed design catalog. Strictly flat 2D vector
graphic: no gradients, no shadows, no glow, no texture, no 3D rendering,
no rounded corners. Exactly one facet filled with red-orange (#FF4500);
everything else black or empty. No letters, no text, no walrus face, no
realistic ivory. Centered in a square composition with generous
whitespace. Must stay legible at 16px favicon size, so keep facet count
low (roughly 10–15 facets).
```

## Rebuild process (raw PNG → assets)

1. **Background removal + color normalization** (Python/PIL/numpy):
   orange mask = `R>140 ∧ (R−B)>70 ∧ (R−G)>50` → forced to `#FF4500`;
   ink alpha = `clip((225 − luminance) / 190 × 255)`, alpha < 40 zeroed (kills paper texture);
   non-orange ink forced to `#000000`. Trim to content bbox + 4% pad, square-pad.
2. **Vectorize** (`potracer` pip pkg, pure Python): downscale to 1024², trace black and orange masks **separately**, two `<path>` layers merged into one SVG. ⚠️ potracer's foreground convention is inverted vs. docs — pass `~mask`. Params: `turdsize=10, alphamax=0.3`.
3. **Size exports**: LANCZOS resize from raster master. Inverse = ink pixels → white, accent untouched; inverse SVG = string-replace `#000000` → `#FFFFFF`.
4. **Verify**: 32px legibility, inverse on black, render SVG via cairosvg (ImageMagick's built-in SVG renderer is unreliable — false alarm risk).

SVG is a potrace draft: when refining in Figma, snap vertices to true straight segments and unify stroke weight (~1.5px feel to match system borders).
