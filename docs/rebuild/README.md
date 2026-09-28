# progr.am rebuild: checkpoint

This is the checkpoint package from section 9 of the rebuild brief. Nothing is built until Kevin approves it.

| # | Document | Contents |
|---|---|---|
| 1 | [01-stack.md](01-stack.md) | Stack options, trade-offs, the recommendation (SvelteKit 2 + Svelte 5), and hosting |
| 2 | [02-build-plan.md](02-build-plan.md) | What exists today (including the old bugs we won't repeat), milestones 0.1–0.7, data model, booking transaction, route map, and changes from the reference docs |
| 3 | [03-availability.md](03-availability.md) | Allow/Block resolution order, two recommended precision changes, and 12 worked examples |
| 4 | [04-programs-scope.md](04-programs-scope.md) | Exactly what "start programs" includes and excludes |
| 5 | [05-design-system.md](05-design-system.md) | Tokens, typography, components, motion, theme handling, and layouts |
| 6 | [06-questions.md](06-questions.md) | Decisions for Kevin, each with a default |

## Mockups

These are static and clickable, in both themes and at phone and desktop widths.

- Open `mockups/index.html` through any static server. For example:

  ```bash
  python -m http.server 5178 --directory docs/rebuild/mockups
  ```

- Then visit <http://localhost:5178>.
- Each page has a theme toggle, and the index links to both themes for every screen.
- The public calendar is fully interactive:
  - pick days
  - add and remove Items
  - filter by Item
  - try `?mode=timed` for occurrences and overlap handling
