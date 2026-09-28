# 5. Design system

The source of truth is `mockups/assets/tokens.css` and `mockups/assets/components.css`. In the app they become `src/lib/styles/tokens.css`, plus one Svelte component per control. Open `mockups/index.html` (or `components.html`) to see everything in both themes.

## Principles

- **Deliberate and quiet.** Neutral surfaces, one accent (indigo), and color reserved for meaning: Item identity and status.
- **Two densities, one system.**
  - **Public pages** are for phones, in hand, during an event: 16 px body text, 44 px touch targets, and generous line height.
  - **Organizer pages** are compact: 14 px body text, 32 px controls, and tight tables.
- **Every state is designed:** empty, loading (skeletons), error, permission-denied, validation next to the field, saving and saved.
- **No browser-default controls anywhere.** Each control is custom, keyboard-operable, labeled, and has a visible focus ring.

## Typeface

**Inter** (variable, self-hosted), with character variants cv11 (single-storey a) and ss01 (open digits).

- It's highly legible at small sizes on phones, has true tabular figures for dates, times, and counts, and has a large weight range.
- It's the reasonable default the brief suggests, and the one the mockups use.
- **JetBrains Mono** is used only for codes and links, e.g. `progr.am/elm-ward`.

**Type scale** (rem):

| Size | Use |
|---|---|
| 11 px | Marker glyphs, dense captions |
| 12 | Captions, table meta |
| 13 | Organizer secondary text |
| **14** | **Organizer body** |
| **16** | **Public body** |
| 18 | |
| 20 | Section titles |
| 24 | Page titles |
| 30 | Public event title (phone) |
| 36 | Public event title (desktop) |

- **Weights:** 400, 500 (labels and controls), 600 (headings), 700 (event titles only).
- **Line heights:** tight 1.2 for titles, 1.5 for UI, 1.65 for program prose.
- **Tracking:** −0.015 em on headings; caps labels at +0.06 em.

## Tokens

| Group | Tokens |
|---|---|
| Color, surfaces | `bg`, `surface-1`, `surface-2`, `surface-3`, `surface-inset`, `overlay`, `border`, `border-strong`, `divider` |
| Color, text | `text`, `text-muted`, `text-subtle`, `text-disabled`, `text-on-accent` |
| Color, accent | `accent`, `accent-hover`, `accent-pressed`, `accent-text`, `accent-tint`, `accent-tint-strong`, `focus` |
| Color, meaning | `success`, `warning`, `danger`, `danger-strong`, `info`, each with a `-tint` |
| Item palette | 12 keys: `red`, `orange`, `amber`, `lime`, `green`, `teal`, `sky`, `blue`, `violet`, `pink`, `brown`, `slate`, plus `item-ink` for glyphs |
| Spacing | 4 px base: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64 |
| Radius | 3, 5, 7, 10, 14, 20, full |
| Borders | 1 px, and 1.5 px strong; focus ring 2 px with a 2 px offset |
| Elevation | `shadow-xs`, `-sm`, `-md`, `-lg`, tuned per theme. Dark relies more on borders; light relies more on shadow. |
| Controls | Heights 28, 32 (organizer), and 44 (public); touch target 44 |
| Layout | Sidebar 224, topbar 48, content max 1152, reading max 640, panel 352 |
| Motion | Durations 80, 120, 180, 260 ms. Easing: `out` (0.2, 0.8, 0.2, 1), `standard`, `in` |
| Layers | sticky, dropdown, sheet, dialog, toast |

**Contrast:**

- Every text/surface pair was checked in both themes with a script, and all pass WCAG AA (4.5:1):
  - `text`
  - `muted`
  - `subtle`
  - `accent-text`
  - text on the accent and danger buttons
  - status colors
- Item colors are ≥ 3:1 against every surface and ≥ 4.5:1 against their glyph ink, in both themes.

## Item identity: color + shape

- **Shapes:** circle, square, triangle, diamond, hexagon, and star, plus a glyph (A–Z or 0–9) on a rounded square.
- **Auto-assignment:** it steps through colors and shapes in a fixed interleaved order, so no two of the first 12 Items share a color, and neighbors never share both color and shape.
- **Why both:** shape means Items stay distinguishable for color-blind users and in grayscale.
- **Storage:** colors are stored as palette keys, so each theme supplies its own tuned value.

## Status encoding (organizer)

Each status has a distinct **fill pattern** as well as a color, so none depends on color alone:

| Status | Encoding |
|---|---|
| Available | Solid green |
| Full | Hatched amber |
| Blocked | Red with a diagonal slash |
| Out of window | Hollow gray |
| Archived | Dashed outline |

## Components

| Component | Notes |
|---|---|
| Button | primary, secondary, ghost, danger, quiet-danger; sm, md, lg; icon-only (requires `aria-label`); loading state keeps its width |
| Field | label, optional/required marker, hint, error (`aria-describedby`, `aria-invalid`) |
| Input, Textarea, InputPrefix | e.g. the `progr.am/` prefix on code fields |
| Select | listbox popover; arrows, Enter, Esc, and typeahead |
| Combobox | searchable listbox; used for Event Time Zone |
| DatePicker | month grid popover; arrows, PageUp/PageDown, Home/End; Today; Clear; min/max |
| TimePicker | typed input with 15-minute suggestions |
| NumberStepper | |
| Checkbox, Radio, Switch | native inputs, visually replaced so a11y is kept |
| Segmented control | radiogroup with roving arrow keys; drives progressive disclosure |
| WeekdayPicker | toggle buttons with `aria-pressed` and full day names as labels |
| Dialog, ConfirmDialog | focus trap; Esc; the safe action gets initial focus; replaces `confirm()` |
| Drawer (organizer edit forms), Sheet (public phone panel) | |
| Menu, Popover, Tooltip | |
| Toast | `aria-live=polite`; optional Undo; auto-dismisses at 3.2 s; stacks bottom-right, or full-width on phones |
| Alert | info, warning, danger |
| Badge, Status | |
| SaveState | saving, saved, error with Retry |
| Skeleton | shimmer is disabled under reduced motion |
| EmptyState | also used for permission-denied states |
| Table | sticky header, `aria-sort` headers, row hover |
| Tabs | |
| Pager | |
| ItemMarker, ItemChip | |
| Calendar grid | role=grid with roving arrow-key focus; day cells describe their state in `aria-label`, e.g. "Thursday, October 1, 2 available, 1 selected" |

## Motion rules

- Motion explains a change; it never decorates:
  - popovers scale in from 98 %
  - drawers and sheets slide 24 px
  - toasts rise 8 px
  - newly picked selections fade and drop in
  - disclosures animate height
- Durations are 120–260 ms. Nothing loops except loading indicators.
- Under `prefers-reduced-motion: reduce`, every duration token becomes 1 ms, and the skeleton shimmer stops.
- **No layout shift:**
  - Skeletons match the final layout.
  - Buttons keep their width while loading.
  - Toasts overlay the page rather than pushing content.
  - Fonts are self-hosted with metric-matched fallbacks.

## Theme handling

- **Dark is the default.** The choice lives in a `theme` cookie (1 year).
- The server reads the cookie in `hooks.server.js` and writes `<html data-theme="…">` into the first byte of HTML. The page therefore never paints in the wrong theme, and needs no client script for it.
- The toggle is in the organizer top bar, the public header, and Account settings.
  - Toggling updates the attribute instantly and writes the cookie.
  - There's no flash on the next load.
- `color-scheme` is set per theme, so scrollbars and form autofill match.
- **Both themes are first-class.** Every milestone's Playwright pass screenshots each screen in dark and light, at 390 px and 1280 px.

## Layout patterns

**Organizer**

- A sticky left sidebar:
  - an event switcher
  - Program and Settings
  - Calendar: Overview, Setup, Items, Availability, Bookings, Export
- A sticky 48 px top bar with breadcrumbs, page actions, the save state, and the theme toggle.
- Below 860 px, the sidebar becomes an off-canvas drawer.
- Editing happens in right-hand **drawers**, so lists stay visible.

**Public calendar**

- **Desktop:**
  - The paper-calendar week grid is on the left.
  - A sticky right column holds the **day panel** and **Your selections**.
- **Phone (≤ 640 px):**
  - The grid is full-width.
  - The day panel is a **bottom sheet** (at most 58 % of the height), so the selected day stays visible above it.
  - Selections collapse into a sticky **bar** ("2 selected · Continue") that expands into its own sheet.
- **State:** a single state object drives the markers, the panel, and the summary, so they can't disagree. Adding an Item keeps the day selected and the panel open.

**Public program**

- A single 640 px reading column.
- Label/value rows switch to stacked on phones.

## Verification method

- Mockups and screens are reviewed in the desktop app's browser preview at 390 px and 1280 px, in both themes.
- In the app, a Playwright spec visits every screen in both themes and both widths and saves screenshots to `test-results/screens/`.
- I review those before each milestone is marked done.
