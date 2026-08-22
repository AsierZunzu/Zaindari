# UI overhaul — plan

A full redesign of the client: design foundation, information architecture, and every
surface. The API is untouched; this is a `client/` change plus brand assets and two
manifest/meta values.

**Status: complete.** All seven phases are done. Two scripts back the result up and are
run by hand: `client/scripts/generate-icons.mjs` redraws every asset in `public/` from one
glyph (edit the glyph there, never the PNGs), and `client/scripts/audit-contrast.mjs`
scores every fill/text pair used in any `.vue` against WCAG AA. `statusTone()` in
`client/src/utils/tone.ts` is settled: a snooze outranks being overdue (§7).

Direction chosen: **herbarium paper** — warm paper ground, deep muted moss greens for
structure, ink-brown-green text instead of grey, earth tones for status. Serif headings
over a humanist sans. Custom line icons in place of emoji.

## 0. Why the current UI reads as generic

Not an aesthetic complaint — a set of concrete, fixable facts:

| Symptom | Where |
| --- | --- |
| `--color-primary-*` is verbatim Tailwind stock `green` | `src/style.css` (the whole file, 15 lines) |
| Page ground is `bg-gray-50`, cards are `bg-white` + `shadow-md` | `App.vue`, every card |
| Default Tailwind greys carry all the text hierarchy | `text-gray-900/700/500/400` everywhere |
| Status colour is `red-100/700`, `yellow-100/700`, `green-100/700` | `TaskRow.badgeClass()`, `PlantCard`, `TaskActions` |
| Emoji as iconography and as the empty-plant image | 🌱 in `PlantCard`, `TaskRow`, `PlantDetailView`, `InventoryView`; task-type emoji from `utils/date.ts` |
| Solid saturated `primary-700` bar with a hamburger | `AppNavigation.vue` |
| Loading is the same 4px spinning ring on three views | `TasksView`, `InventoryView`, `PlantDetailView` |
| No typeface chosen at all | no `@font-face`, no `--font-*` token |

Everything above is default-out-of-the-box. Nothing was *chosen*, which is exactly what
reads as machine-made.

### Anti-slop rules for this redesign

Binding constraints, not vibes:

1. **Borders and ground-shifts carry separation, not shadows.** At most one shadow level
   (`--shadow-lift`, a low soft one) and only for things that genuinely float: menus,
   popovers, the mobile bar. No `shadow-md`/`shadow-lg` on static cards.
2. **No gradients** except, at most, a single hairline photo scrim. No gradient text, ever.
3. **One accent.** Moss green is structure and action. Status uses earth tones (clay,
   honey), never `red-500`/`yellow-400`. No blue anywhere — the current undo button's
   `bg-blue-50` is a stray.
4. **Not everything is a pill.** `rounded-full` is reserved for avatars and dot markers;
   surfaces use a small, deliberate radius scale (`4 / 8 / 14px`).
5. **The photos are the colour.** Plant pictures are the most saturated thing on screen;
   the chrome stays desaturated so they carry it.
6. **Asymmetric type scale.** Serif headings get tight tracking and real size contrast;
   don't ship six near-identical `text-sm font-semibold` headings (`SettingsView` and
   `PlantDetailView` currently do).
7. **No decorative leaf confetti, no glassmorphism, no floating blurred blobs.** The
   naturalism comes from colour, paper texture and typography, not stickers.

---

## 1. Foundation — tokens (`client/src/style.css`)

Tailwind v4 keeps theming in CSS, so this is one file and it propagates to every utility.

**Keep the `--color-primary-*` scale name** and re-point its values, rather than renaming
across ~4000 lines of template. That also keeps `TaskCalendar.test.ts`'s
`ring-primary-500` assertion meaningful.

```
/* raw scale — moss */
--color-primary-50 .. 950     re-pointed to the moss ramp below
                              (50 #F1F4EE · 100 #E2E9DC · 200 #C7D2BC · 300 #A5B899
                               400 #86A077 · 500 #6B8F5E · 600 #57774C · 700 #4A6741
                               800 #3A5134 · 900 #2C3E28 · 950 #1B2718)

/* semantic aliases — what components should actually use */
--color-ground        #FAF8F3   page, warm paper
--color-surface       #FFFDF9   card
--color-surface-sunk  #F3F0E8   inset wells, inputs, image placeholders
--color-ink           #23281F   primary text (green-black, not #111)
--color-ink-muted     #5C6357   secondary text
--color-ink-faint     #8A9082   tertiary / meta
--color-line          #E3DED2   hairline borders (the workhorse)
--color-line-strong   #CFC8B8

/* status — earth, not traffic lights */
--color-overdue / -soft   #A6603F / #F4E4DB   clay
--color-due    / -soft    #C08A2E / #F8EEDA   honey
--color-done   / -soft    #4A6741 / #E2E9DC   moss
--color-idle   / -soft    #8A9082 / #F0EDE4   stone

--radius-sm/md/lg     4px / 8px / 14px
--shadow-lift         0 6px 20px -8px rgb(35 40 31 / .18)
--font-display        "Fraunces", Georgia, serif
--font-sans           "Public Sans", system-ui, sans-serif
```

Plus a base layer: `body { background: --color-ground; color: --color-ink; }`, a
`::selection` in `lichen`, `:focus-visible` ring in moss (the app currently ships browser
default focus rings), and `@media (prefers-reduced-motion)` killing transitions.

**Optional, cheap, high impact:** a ~2KB tiling paper-grain PNG at 3–4% opacity on the
ground. Test it; drop it if it reads as noise on OLED phones.

**Component utilities.** Add a handful of `@utility` definitions so the same five
recipes stop being retyped: `card`, `card-inset`, `btn` / `btn-primary` / `btn-quiet` /
`btn-danger`, `field` (input+label+error), `badge`, `section-title`. Roughly 60 lines of
CSS that removes several hundred repeated utility strings — the current
`rounded-lg border border-gray-200 bg-white p-5` appears verbatim in five places in
`SettingsView` alone.

**Dark mode: out of scope for this pass.** The token layer above is the thing that makes
it a later half-day instead of a rewrite; adding it now doubles the review surface of
every screen. Recorded in `FUTURE_DEVELOPMENTS.md`.

## 2. Foundation — typography

- **Display: Fraunces** (variable, has real optical-size and "wonk" axes — a botanical
  plate feel without novelty-font silliness). Used for `h1`/`h2` and plant names only.
- **Body: Public Sans** (humanist, open apertures, not Inter — Inter is itself a slop tell).
- **Self-hosted, latin + latin-ext subsets** via `@fontsource-variable/*`. Basque and
  Spanish need latin-ext; verify `ñ`, `á`, `ü` render.
- ⚠️ **`vite.config.ts` `injectManifest.globPatterns` does not include `woff2`.** Add it,
  or the installed PWA falls back to Georgia the first time it opens offline.
- `font-display: swap`, and preload the two body weights in `index.html`.

## 3. Foundation — iconography

Replace every emoji with an inline SVG sprite, `client/src/components/icons/`:

- Task types: **watering-can, shears, leaf-fertiliser, repot-pot, mist, inspect** — must
  cover every `TaskType` the server defines; `utils/date.ts:taskTypeEmoji()` becomes
  `taskTypeIcon()` returning a sprite id (still a pure key-returning function — that
  convention stays).
- UI: check, clock/snooze, undo, plus, pencil, trash, share, chevron, location-pin,
  camera, menu, calendar, list.
- Empty-plant fallback: a drawn line-art sprig, one asset, replaces 🌱 in four places.
- Style: 1.5px stroke, round caps/joins, 24px grid, `currentColor`.
- One `<Icon name="..." />` component (`<use href>` against a bundled sprite, no runtime
  fetch — an offline PWA must not depend on a network sprite).
- Delete `public/icons.svg` (Bluesky/Discord logos from a template; unreferenced).

**Not** an icon library install — Lucide-everywhere is its own generic look, and a
six-icon hand-drawn set is a day's work that carries the whole theme.

## 4. Information architecture

Current: top green bar with Tasks · Inventory · +Add Plant · avatar dropdown
(Settings/Admin/Logout); hamburger sheet on mobile. This is a desktop pattern in an app
that is installed on phones.

Proposed:

| Now | Becomes | Why |
| --- | --- | --- |
| "Tasks" (`/`) | **Care** | Landed as Care, not Today: the screen also holds a month calendar, so "Today" would have mislabelled half of it. It pairs with Garden — what to do, and what you have |
| "Inventory" (`/inventory`) | **Garden** (`/garden`, redirect from `/inventory`) | "Inventory" is warehouse language for a plant-care app |
| "+ Add Plant" nav item | Center **+** action in the bar / a quiet button in the top rail | It is the primary creative act |
| Avatar dropdown | **You** tab → Settings screen; Admin becomes a row inside it | A dropdown hiding Settings + Admin + Logout is three unrelated things in one menu |

- **Mobile (< md): bottom tab bar** — Today · Garden · **+** · You. Safe-area inset padding,
  `--shadow-lift`, hides on scroll-down. The hamburger sheet goes away entirely.
- **Desktop (≥ md): a slim top rail** on the paper ground with a hairline bottom border —
  not a saturated green slab. Brand mark left, tabs centre-left, add + avatar right.
- **`PlantDetailView`** is currently one long scroll of six `text-sm font-semibold`
  sections. Restructure: full-bleed photo hero with the name over a scrim → an at-a-glance
  care strip (next task per type) → segmented **Tasks / Schedule / Photos**, with the
  destructive actions moved out of the header row into the bottom of the Schedule pane.
- **`SettingsView`** (366 lines, four visually identical sections) gets a left-hand section
  index on desktop, accordion on mobile.
- **Admin** keeps `AdminLayout`'s child routes; it just gains the new chrome.

i18n consequence: `nav.tasks` / `nav.inventory` / `plants.inventory` / `routes.*` and
friends need new wording in **all three** catalogs — `locales.test.ts` enforces key,
placeholder and plural parity, so partial edits fail the suite loudly (good).

## 5. Work breakdown

Ordered so each phase leaves the app shippable.

**Phase 1 — Foundation** (`style.css`, fonts, icon sprite + `Icon.vue`, `vite.config.ts`
woff2, base element styles, `@utility` recipes). Nothing visibly changes except colour and
type — but every later phase depends on it. *Largest single payoff; do not skip ahead.*

**Phase 2 — Shell & IA** (`App.vue`, `AppNavigation.vue` → `TopRail.vue` +
`BottomBar.vue`, router `/garden` + redirect, i18n renames ×3 locales,
`AppNavigation.test.ts` updated). Ends with the app *feeling* different on first load.

**Phase 3 — Core surfaces** — `PlantCard`, `TaskRow`, `TaskActions`, `TaskAgenda`,
`TaskCalendar`, empty states, and a replacement for the three copies of the spinner ring
(a quiet paper-toned skeleton for lists; the ring only where a skeleton makes no sense).
These are what a user stares at all day.

**Phase 4 — Views** — `TasksView`, `InventoryView`→Garden, `PlantDetailView` (the
restructure above), `PlantFormView`, `SettingsView`, `LoginView`, `RegisterView`,
`AuthCallbackView`. Login/Register are the first impression: single centred paper card,
serif wordmark, no drop shadow.

**Phase 5 — Admin** (`AdminLayout`, `Users`, `Config`, `Schedules`, `Oidc` — 851 lines).
Lower stakes, mostly forms and tables; the `@utility` recipes do most of the work.

**Phase 6 — Brand & shell metadata**
- `index.html` `<meta name="theme-color">`: `#15803d` → moss `#4A6741`.
- `vite.config.ts` manifest `theme_color` / `background_color` → `#4A6741` / `#FAF8F3`.
- Redraw `favicon.svg`, `icon.svg`, `apple-touch-icon.png`, `pwa-192`, `pwa-512`,
  `maskable-icon-512`, `badge.svg`, `badge-96x96.png` in the new mark. The maskable one
  must keep its safe-area padding (there's a comment in `vite.config.ts` explaining why).
- ⚠️ Changing the icons/manifest means the installed PWA updates its icon only on
  reinstall on some Androids — expected, worth a line in the release note.

**Phase 7 — Verification**
- `npm run build` (`vue-tsc -b` is the only static check in the client).
- `npm test` — expect edits in `AppNavigation.test.ts` (nav labels/structure),
  `TaskCalendar.test.ts` (`ring-primary-500` should survive by design),
  `PlantCard.test.ts`, `locales.test.ts` (will fail until all three catalogs are updated).
- Contrast audit: every ink/status pair on both `ground` and `surface` must clear WCAG AA
  (4.5:1 body, 3:1 large). `ink-faint` on `surface` is the one most likely to fail —
  darken it rather than dropping it.
- Check the sunk/placeholder tones against real plant photos; warm paper next to green
  foliage can go muddy.
- Delete `client/src/components/__tests__/TaskRow.scratch.test.ts` (untracked scratch file)
  before touching `TaskRow`.

## 6. Risks

- **`TaskCalendar.vue`** (283 lines) has pointer/hover/popover logic keyed to
  `lastPointerType`. Restyle it; do not rewrite the interaction, and re-test on touch.
- **`AuthedImage`/`useAuthedImage`** hand out object URLs — any new image surface (the
  detail hero, the photo strip) must go through them, never a plain `<img src>`.
- **i18n parity** will hard-fail the suite mid-refactor. That's the design; finish all
  three catalogs in the same commit.
- **Scope**: phases 1–4 are the redesign. 5–6 can land in follow-up commits.

## 7. The snooze decision — settled

A snoozed task whose `dueAt` has already passed reads as **honey, not clay**. The user
deliberately deferred it, and an app that keeps shouting after being told "not now"
teaches them that snoozing does nothing; it returns to clay when the snooze expires and
`SchedulerService` moves the task back to `pending`. `skipped` is stone for the same
reason.

That ordering is the whole of `statusTone()`, and it is covered by
`client/src/utils/__tests__/tone.test.ts`. Writing it down also surfaced a bug the old
per-component if-chains shared: they tested `isOverdue` *before* the status, so a task
skipped last week still glowed red on the plant page.
