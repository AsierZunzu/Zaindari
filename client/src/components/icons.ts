/**
 * The icon set, drawn for this app rather than installed from a library.
 *
 * Every icon is a list of `d` attributes on a 24×24 grid, stroked at 1.5 with
 * round caps and joins — including the dots, which are zero-length segments
 * (`M7 6.5h.01`) so that a single `<path>` renderer covers the whole set.
 *
 * Two constraints shaped this:
 *  - It replaces emoji (💧, 🌱, 💨, 🪴). Emoji are drawn by the OS, so the same
 *    screen looked like three different apps across Android, iOS and desktop.
 *  - It is inline path data, not an SVG sprite fetched by `<use href>`: the app
 *    is an installed PWA and must render its own icons with no network and no
 *    dependency on the Workbox precache having picked the sprite up.
 */

export const ICON_PATHS = {
  // --- task types --------------------------------------------------------
  watering: [
    'M5 10.5h8v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
    'M4 10.5h10',
    'M8.5 10.5V8.5a1.75 1.75 0 0 1 3.5 0v2',
    'M13 12.5h3.2l2.8-3.2',
    'M17.4 7.6 20.6 10.4',
    'M20 13.5v1.5',
    'M17.6 15.5v1.2',
  ],
  fertilization: [
    'M5 20h14',
    'M12 20v-4.2',
    'M12 15.8c0-2.2 1.7-3.7 4-3.9.2 2.2-1.5 3.9-4 3.9z',
    'M12 16.6c0-1.8-1.4-3-3.3-3.2-.2 1.8 1.1 3.2 3.3 3.2z',
    'M7.5 6.5h.01',
    'M11 4.5h.01',
    'M14.5 6.8h.01',
    'M9 10h.01',
    'M13 9.6h.01',
  ],
  misting: [
    'M8 10.5h5v8a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 1 8 18.5z',
    'M9.5 10.5V8h2.5v2.5',
    'M12 6.5h3.6',
    'M17.5 4.8 19 3.8',
    'M18 7h2',
    'M17.5 9.2 19 10.2',
  ],
  repotting: [
    'M5 11.5h14',
    'M6.5 11.5 7.7 19a1.6 1.6 0 0 0 1.6 1.4h5.4a1.6 1.6 0 0 0 1.6-1.4l1.2-7.5',
    'M12 11.5V8',
    'M12 9c0-2 1.6-3.4 3.6-3.6.2 2-1.4 3.6-3.6 3.6z',
    'M12 9.5C12 7.9 10.8 6.8 9 6.6c-.2 1.6 1 2.9 3 2.9z',
  ],

  // --- botanical ---------------------------------------------------------
  /** The fallback for a plant with no photo, and the brand mark. */
  sprig: [
    'M12 21V9',
    'M12 13c0-3.3 2.4-5.6 6-6 .4 3.6-1.9 6-6 6z',
    'M12 16c0-2.6-1.9-4.4-4.7-4.7C7 14.1 8.9 16 12 16z',
  ],
  leaf: ['M4.5 19.5C4.5 11 10 5.5 19.5 4.5 18.5 14 13 19.5 4.5 19.5z', 'M9 15 15.5 8.5'],

  // --- actions -----------------------------------------------------------
  check: ['M5 12.5 10 17.5 19 7'],
  clock: ['M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z', 'M12 8v4.5l3 2'],
  undo: ['M4 10h9.5a5.5 5.5 0 0 1 0 11H9', 'M4 10l4-4', 'M4 10l4 4'],
  plus: ['M12 5v14', 'M5 12h14'],
  pencil: ['M4.5 19.5h4L19 9a2.5 2.5 0 0 0-3.5-3.5L5 16v3.5z', 'M14.5 6.5 17.5 9.5'],
  trash: [
    'M5 7h14',
    'M9.5 7V5.5h5V7',
    'M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7',
    'M10.5 11v6',
    'M13.5 11v6',
  ],
  share: [
    'M17 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    'M7 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    'M17 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    'M9.2 10.8 14.8 7.7',
    'M9.2 13.2 14.8 16.3',
  ],
  download: ['M12 4v11', 'M8 11l4 4 4-4', 'M5 19.5h14'],
  upload: ['M12 15V4', 'M8 8l4-4 4 4', 'M5 19.5h14'],
  camera: ['M4.5 8.5h3l1.5-2h6l1.5 2h3v10h-15z', 'M12 16.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M16.2 16.2 20.5 20.5'],

  // --- navigation & chrome ----------------------------------------------
  calendar: ['M4.5 6.5h15v13h-15z', 'M4.5 10.5h15', 'M8.5 4v3', 'M15.5 4v3'],
  agenda: ['M4.5 6.5h15v13h-15z', 'M4.5 10.5h15', 'M8.5 4v3', 'M15.5 4v3', 'M9 15l2 2 4-4'],
  list: ['M4 7h3', 'M4 12h3', 'M4 17h3', 'M9.5 7H20', 'M9.5 12H20', 'M9.5 17H20'],
  'chevron-down': ['M6 9.5 12 15.5 18 9.5'],
  'chevron-left': ['M14.5 5.5 8 12l6.5 6.5'],
  'chevron-right': ['M9.5 5.5 16 12l-6.5 6.5'],
  'arrow-left': ['M19 12H5', 'M11 6l-6 6 6 6'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  close: ['M6 6 18 18', 'M18 6 6 18'],
  pin: [
    'M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21z',
    'M12 12.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
  ],
  user: [
    'M12 12a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z',
    'M4.5 20c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5',
  ],
  settings: ['M4 8h10', 'M18 8h2', 'M4 16h4', 'M12 16h8', 'M16 5.5v5', 'M8 13.5v5'],
  logout: [
    'M15 8.5V6a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 15 18v-2.5',
    'M10.5 12H20',
    'M17 9l3 3-3 3',
  ],
  key: [
    'M8.5 19a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M11 13 19.5 4.5',
    'M17 6.5 19 8.5',
    'M14.5 9 16 10.5',
  ],
  shield: ['M12 3.5 19.5 6v6c0 4.5-3.2 7.6-7.5 9-4.3-1.4-7.5-4.5-7.5-9V6z'],
  bell: [
    'M12 4a5.5 5.5 0 0 0-5.5 5.5c0 4.5-1.5 6-1.5 6h14s-1.5-1.5-1.5-6A5.5 5.5 0 0 0 12 4z',
    'M10.3 19a2 2 0 0 0 3.4 0',
  ],
  globe: [
    'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z',
    'M3.5 12h17',
    'M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5S14.2 18.2 12 20.5C9.8 18.2 8.6 15.2 8.6 12S9.8 5.8 12 3.5z',
  ],
  image: [
    'M4.5 5.5h15v13h-15z',
    'M4.5 15l4.5-4 4 3.5 3-2.5 3.5 3',
    'M9 10a1.2 1.2 0 1 0 0-2.4A1.2 1.2 0 0 0 9 10z',
  ],
  alert: ['M12 8v5', 'M12 16.5h.01', 'M12 4.5 21 20H3z'],
} as const

export type IconName = keyof typeof ICON_PATHS
