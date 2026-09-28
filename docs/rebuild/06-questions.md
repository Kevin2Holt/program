# 6. Questions for Kevin

Each question has a recommended default. If you just say "approved", I use the defaults.

1. **Stack.** Is SvelteKit 2 + Svelte 5 (recommended) OK? And JavaScript with JSDoc types (default) or TypeScript?
2. **Availability, Change A.** Only *recurring* Allow rules put an Item into whitelist mode; one-time Allows are exceptions on top. Without this, one "Allow Sunday Oct 4" closes the whole calendar. *Default: yes.*
3. **Availability, Change B.** A recurring Allow whitelists an Item only within its own start/end dates. *Default: yes.*
4. **Rolling window size.** Does "3 weeks" mean *this week plus 3 more* (the Phase 2 spec reading, default) or *3 weeks total including this week*? The same question applies to months.
   - Days mode is always a literal count, starting today.
5. **Monthly on day 29–31.** In months without that day, **skip** (default, like Google Calendar) or **clamp** to the last day?
6. **"Applies to" when the organizer clicks "Selected Items" while every Item is checked.** Default: uncheck all and focus the first checkbox, then let the automatic switching take over. Saving with none checked stores "All Items".
7. **Program header fields.** Do you want a small header on each program version (eyebrow, title, date, time, place), as in the mockups? *Default: yes.* The alternative is making it an ordinary first text block.
8. **Public tab label.** Should the public navigation call the calendar **"Sign up"** (default) or the calendar's title?
9. **Same-day signups.** *Decided:* an optional **Minimum days ahead** setup field, default 0 (same day allowed). Original question: Can people sign up for *today* (default: yes), or should there be a cutoff, e.g. "at least 1 day ahead"? A cutoff would be a new setup field.
10. **Undo after cancel.** An organizer's "Cancel booking" toast offers Undo for about 5 s. If the slot was taken in the meantime, Undo fails and explains why. OK? *Default: yes.*
11. **Email transport for production.** Is SMTP fine for later (e.g. through your email provider)? Development only logs emails either way.
12. **Hosting.** Will the temporary domain run on this home server (Cloudflare Tunnel) or on a VPS? This doesn't block building; it only affects the handoff notes.
