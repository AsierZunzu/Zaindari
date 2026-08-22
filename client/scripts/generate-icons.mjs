/**
 * Regenerates every brand asset in `public/` from one source: the `sprig`
 * glyph the app already draws in `src/components/icons.ts`.
 *
 *   node scripts/generate-icons.mjs
 *
 * It exists so the PNGs are not the source of truth. They cannot be edited or
 * reviewed, and an icon set with no source drifts the moment the palette moves.
 *
 * The glyph is redrawn here rather than imported, because the icon set is
 * stroked outlines on a 24 grid and a mark needs filled leaves: at 48px a
 * stroked leaf closes up into a blob, while a filled one stays a leaf.
 *
 * sharp is borrowed from `server/node_modules` — the client has no image
 * dependency of its own and does not need one for a script run by hand.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(here, '..', 'public')
const require = createRequire(join(here, '..', '..', 'server', 'package.json'))
const sharp = require('sharp')

const MOSS = '#4a6741'
const PAPER = '#faf8f3'

// Stops where the upper leaf meets it: filled at icon size, a stem poking above
// the leaves reads as a spoon rather than a shoot.
const STEM = 'M12 21V12.4'
const LEAF_UPPER = 'M12 13c0-3.3 2.4-5.6 6-6 .4 3.6-1.9 6-6 6z'
const LEAF_LOWER = 'M12 16c0-2.6-1.9-4.4-4.7-4.7C7 14.1 8.9 16 12 16z'

/** The glyph on a 24 grid, scaled about its own centre and nudged onto the
 *  tile's axis — the sprig leans right of centre by design. */
function mark(color, scale) {
  return `<g transform="translate(12 12) scale(${scale}) translate(-12.6 -12.4)">
    <path d="${STEM}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>
    <path d="${LEAF_UPPER}" fill="${color}"/>
    <path d="${LEAF_LOWER}" fill="${color}"/>
  </g>`
}

const svgs = {
  // Browser tab: a rounded tile, so it reads as a mark on light and dark chrome.
  'favicon.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="5" fill="${MOSS}"/>
  ${mark(PAPER, 0.86)}
</svg>
`,
  // Source for the standard PWA icons. Square and full bleed: Android rounds
  // this itself, and the maskable variant is what fills a shaped launcher.
  'icon.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="${MOSS}"/>
  ${mark(PAPER, 0.86)}
</svg>
`,
  // Android masks the notification badge by its alpha channel and throws the
  // colours away, so this is the glyph alone: only opaque/transparent survives.
  'badge.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24">
  ${mark('#ffffff', 0.92)}
</svg>
`,
}

// Never written to `public/`: a launcher crops a maskable icon to its own
// shape, so the glyph is pulled inside the 80% safe circle and only the moss is
// allowed to reach the edge. Nothing but the PNG needs to exist.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="${MOSS}"/>
  ${mark(PAPER, 0.62)}
</svg>
`

for (const [name, body] of Object.entries(svgs)) {
  writeFileSync(join(PUBLIC, name), body)
  console.log(name)
}

const rasters = [
  [svgs['icon.svg'], 'pwa-192x192.png', 192],
  [svgs['icon.svg'], 'pwa-512x512.png', 512],
  [svgs['icon.svg'], 'apple-touch-icon.png', 180],
  [maskable, 'maskable-icon-512x512.png', 512],
  [svgs['badge.svg'], 'badge-96x96.png', 96],
]

for (const [body, out, size] of rasters) {
  // Render well above the target and downsample: librsvg rasterises at the
  // density it is given, and a 96px badge drawn at 96px has ragged leaf edges.
  await sharp(Buffer.from(body), { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(PUBLIC, out))
  console.log(out, `${size}px`)
}
