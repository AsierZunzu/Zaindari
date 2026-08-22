/**
 * Checks the palette against WCAG AA, using the tokens as they are actually
 * used rather than as they are defined.
 *
 *   node scripts/audit-contrast.mjs
 *
 * It resolves `--color-*` out of `src/style.css`, then walks every class
 * attribute in every `.vue` file and scores each `bg-`/`text-` pair that
 * appears together. Where an attribute names no background, the token is
 * scored against both page grounds, since a component can land on either.
 *
 * Two thresholds, because WCAG has two: 4.5:1 for body text, 3:1 for icons and
 * other meaningful graphics. Anything between them is reported rather than
 * failed — correct for a 20px icon, wrong for a 12px caption, and only the
 * person reading the line can say which it is.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'src/style.css'), 'utf8')
const TOKENS = Object.fromEntries(
  [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]),
)
TOKENS.white = '#ffffff'
TOKENS.black = '#000000'

const luminance = (hex) => {
  const parts = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// `text-ground` is paper-coloured type, which only ever sits on a photo scrim
// or an ink overlay — backgrounds this script cannot see and should not guess.
const EXEMPT_FOREGROUND = new Set(['ground'])
// Tailwind words that follow `text-` without naming a colour.
const NOT_COLOURS = new Set(['xs','sm','base','lg','xl','2xl','3xl','4xl','5xl','6xl','7xl','8xl','left','right','center','justify','wrap','nowrap','balance','ellipsis'])

const CLASS_ATTR = /(?:class|active-class|exact-active-class)="([^"]*)"/g
const BG = /(?<![\w-])!?bg-([a-z0-9-]+)(?![\w/-])/g
const FG = /(?<![\w-])!?text-([a-z0-9-]+)(?![\w/-])/g

function* vueFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* vueFiles(full)
    else if (entry.name.endsWith('.vue')) yield full
  }
}

const failures = []
const review = []
let checked = 0

for (const file of vueFiles(join(root, 'src'))) {
  const rel = file.slice(root.length + 1)
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [, attr] of line.matchAll(CLASS_ATTR)) {
        const grounds = [...attr.matchAll(BG)]
          .map((m) => m[1])
          .filter((name) => TOKENS[name])
          .map((name) => [name, TOKENS[name]])
        const fgs = [...attr.matchAll(FG)]
          .map((m) => m[1])
          .filter((name) => TOKENS[name] && !NOT_COLOURS.has(name) && !EXEMPT_FOREGROUND.has(name))
        if (fgs.length === 0) continue

        const against = grounds.length
          ? grounds
          : [['(ground)', TOKENS.ground], ['(surface)', TOKENS.surface]]

        for (const fg of fgs) {
          for (const [bgName, bgHex] of against) {
            checked += 1
            const ratio = contrast(TOKENS[fg], bgHex)
            if (ratio >= 4.5) continue
            const row = `${ratio.toFixed(2)}  text-${fg} on bg-${bgName}  ${rel}:${i + 1}`
            ;(ratio < 3 ? failures : review).push(row)
          }
        }
      }
    })
}

console.log(`${checked} token pairs checked\n`)
if (failures.length) {
  console.log(`FAIL — below 3:1, illegible as text or as a graphic (${failures.length}):`)
  for (const row of [...new Set(failures)].sort()) console.log(`  ${row}`)
  console.log()
}
if (review.length) {
  console.log(`REVIEW — 3:1 to 4.5:1, fine for icons and large text only (${review.length}):`)
  for (const row of [...new Set(review)].sort()) console.log(`  ${row}`)
  console.log()
}
if (!failures.length && !review.length) console.log('Every pair clears AA for body text.')
process.exit(failures.length ? 1 : 0)
