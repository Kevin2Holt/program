# 4. Programs scope ("start programs")

## Included in milestone 0.3

**Versions**

- `draft`, `published`, and `previous`, with at most one row of each per event. The database enforces this.
- The draft always exists; it's created with the event.

**Blocks stored as rows**

- The version's `block_order` (a JSON array of block ids) is the source of truth for order.
- Every create, duplicate, delete, and reorder updates the block rows and `block_order` in **one transaction**.
- A consistency check (every id in `block_order` exists, and every block is listed once) runs in tests and at the end of each mutation.

**Block types** (a registry in `src/lib/blocks/`, so a new type is a new folder):

- **Text:** Tiptap rich text.
  - Stored twice: ProseMirror JSON for re-editing, and sanitized HTML for rendering.
  - Toolbar: heading, bold, italic, underline, strike, bullet and numbered lists, and link.
- **Label/value:** an ordered list of rows, rendered as a `<dl>`. Rows can be added, removed, and reordered.
- **Separator:** `line` or `space`.

**Editor**

- Create, edit, duplicate, and delete blocks. Delete shows a toast with **Undo**, not a confirm dialog, to keep the editing flow fast.
- Insert a block between any two blocks with the "+" gap.
- Reorder by drag and by keyboard: focus the grip, press Space to pick up, arrow keys to move, Space to drop.
- **Autosave:**
  - Debounced at about 600 ms per block.
  - The indicator shows Saving…, Saved, or "Not saved · Retry".
  - Saves are ordered per block, so a slow request can't overwrite a newer one.
  - Leaving with unsaved changes flushes the save first.
- Program header fields: eyebrow, title, date, time, and place. **See Questions.**
- **Live preview:**
  - Uses the exact renderer and CSS of the public page, so preview and public can't drift.
  - Shown side by side on wide screens, and as a Preview toggle on narrow ones.

**Publishing**

- **Publish:** deep-copies the draft into `published`, and the old `published` becomes `previous`.
- **Unpublish:** confirmed in a custom dialog. The public page then shows "This program isn't available right now."
- **Roll back:** swaps `published` and `previous`, after a custom confirm. The draft is not touched.
- The top bar shows whether the draft has **unpublished changes**.

**Public program page** at `/[code]`

- Server-rendered with almost no JS.
- Readable one-handed on a phone.
- Shows a calendar card and link when the event's calendar status is `open` (or `closed`, with a "signups closed" note).
- Old codes redirect with a 308.

**Sanitization** on the server, before storage *and* before render:

- Tags allowed: `p br strong em u s ul ol li a span h1–h6`.
- Links allowed only with `http`, `https`, or `mailto`.
- External links get `rel="noopener noreferrer"`. If `target="_blank"` is allowed, it always gets that `rel`.
- All attributes except `href` on `a` are stripped. There are no inline styles and no classes, except on `span` if a later mark needs it.

**Permissions:** `program.view`, `program.edit`, and `program.publish`, checked on every route and API call.

## Excluded (clean extension points only)

| Deferred | Extension point left |
|---|---|
| Column blocks | Block registry. The `content` shape for columns is designed, as nested `block_order`s in one version. The renderer dispatches by type. |
| Password-gated events | An `events.access` column is reserved in the plan (not created). Public resolution goes through one `resolvePublicEvent()` function that a gate can wrap. |
| Team invites, editor and viewer roles | `event_members.role` already allows `editor` and `viewer`. `permissionsFor(role)` is the single mapping to change. |
| Password reset and email verification | The mailer interface exists. `users.email_verified_at` is reserved in the plan (not created). |
| Attachments and embeds | New block types in the registry. The sanitizer allowlist is per block type. |
| Program templates, version history beyond `previous`, scheduled publishing | Not planned. |
