# 3. Availability semantics

## The proposed order (from the brief)

For each Item on each date:

1. Outside the date window → unavailable.
2. Item archived → unavailable.
3. Baseline: if the Item has any active Allow rules, it starts unavailable; otherwise available.
4. Apply matching recurring rules. Allow opens the date; Block closes it; if both match, Block wins.
5. Apply matching one-time rules on top. They override recurring rules; if both kinds match on the same date, Block wins.
6. No remaining capacity → unavailable ("full" for organizers).

## Recommended changes

The order stays the same. Two changes make step 3 more precise.

### Change A: only *recurring* Allow rules set the baseline

As written, "any active Allow rules" includes one-time Allow rules, and that breaks the most common use of a one-time Allow.

- **Setup:** the organizer has "Block every Sunday" and adds "Allow Sunday Oct 4" to open one Sunday.
- **Literal reading:** the one-time Allow is an Allow rule, so every Item now starts **unavailable on every date**. The whole calendar closes except Oct 4.
- **Why that's wrong:** a one-time Allow is an exception, not a whitelist. So:
  - One-time Allows open a date *on top of* whatever else is true.
  - Recurring Allows define a whitelist ("this Item is only available on these days").

### Change B: a recurring Allow sets the baseline only inside its own start/end bounds

- **Setup:** "Allow Tue/Thu/Sat, starting Nov 1".
- **Rule as written:** the Item would be closed every day *before* Nov 1 too, because it "has an Allow rule".
- **With bounds:** before Nov 1 the Item behaves normally; from Nov 1 it's only open Tue/Thu/Sat.
- **If "closed until the rule starts" is actually wanted:** set the window to start then, or add a Block rule.

### The resolution with both changes

For each Item `I`, date `D`, and (in timed mode) occurrence `O`:

```
1. D outside the window (or before today in the event time zone)  → OUT_OF_WINDOW
2. I archived (or, in timed mode, O's time archived / not on D)     → ARCHIVED
3. recurringAllows = active recurring Allow rules that target I and whose [starts_on, ends_on] contains D
   state = recurringAllows is empty ? OPEN : CLOSED
4. R = active recurring rules that target I and match D
   if any R is Block        → state = CLOSED (blockedBy = that rule)
   else if any R is Allow   → state = OPEN
5. T = active one-time rules that target I on D
   if any T is Block        → state = CLOSED (blockedBy = that rule)
   else if any T is Allow   → state = OPEN
6. if state is CLOSED       → BLOCKED
   used = count of selections of active bookings for (I, D) or (O, D)
   if used >= capacity      → FULL
   else                     → AVAILABLE
```

**How rules are matched:**

- **Target:** a rule targets `I` when `applies_to = all`, or when `I` is one of the rule's checked Items. Item ids are normalized to one type at the data layer. The old string-vs-number bug gets a regression test.
- **Scope:** rules are date-level. In timed mode, a date that's open or closed applies to every occurrence of that Item on that date. Capacity is then checked per occurrence.
- **Inactive rules** are ignored everywhere, including in step 3.

**What each audience sees:**

- **Public:** `AVAILABLE` is "available"; every other state is "unavailable". Public markers are drawn only for `AVAILABLE`.
- **Organizers** see all five states, plus the rule that caused a block.

**Recurrence details** (one module, `recurrence.js`):

- **daily:** every date.
- **weekly:** the date's weekday is one of the chosen weekdays.
- **biweekly:**
  - The weekday must be one of the chosen weekdays.
  - It matches in the week of `starts_on` (weeks start Sunday), and in every second week after that.
  - A biweekly rule requires `starts_on`, because that's the anchor. The old code silently anchored to 1970.
- **monthly by date:**
  - Day N of each month.
  - Months without day N are **skipped**, not clamped. This matches Google Calendar. **See Questions.**
- **monthly by weekday:**
  - The Nth given weekday of the month, for N = 1–4.
  - Or "Last", the last such weekday in the month.
- **Bounds:** `starts_on` and `ends_on` are inclusive and optional.

The **date window** (`dateWindow.js`) works in the event time zone:

- **Fixed:** start to end, inclusive.
- **Rolling, days:** today plus the next N−1 days.
- **Rolling, weeks:** the current Sunday-to-Saturday week plus the next N whole weeks.
- **Rolling, months:** the current month plus the next N whole months.
- **Past days** inside the current week or month show on the grid, but are muted and can't be selected.

## Worked examples

**Setup:** event time zone America/Denver.

**Items:**

- A: Elders Ramos & Chen, capacity 1
- B: Elders Tuilagi & Brooks, capacity 1
- C: Sisters Okafor & Lind, capacity 1
- D: Sisters Park & Moreau, capacity 1

**Window:** rolling 3 weeks, so this week plus 3: Sep 27 – Oct 24, 2026. Today is Mon Sep 28.

| # | Rules (all active) | Item / date | Steps | Result |
|---|---|---|---|---|
| 1 | Block weekly Sun (All) · Allow once Sun Oct 4 (All) | A, Sun Oct 4 | 3: no recurring Allows, so OPEN. 4: Block Sun matches, so CLOSED. 5: one-time Allow, so OPEN. 6: 0/1 used. | **Available** |
| 1b | same | A, Sun Oct 11 | 3 OPEN → 4 CLOSED → 5 no one-time rule | **Blocked** |
| 1c | same, *literal* step 3 (no Change A) | A, Wed Oct 7 | 3: A "has an Allow rule", so CLOSED. Nothing opens Wednesday. | *Blocked*. The whole calendar closes, which is why Change A is recommended. |
| 2 | Allow weekly Tue/Thu/Sat, **Selected Items: D** | D, Wed Oct 7 | 3: D has a recurring Allow, so CLOSED. 4: Wed doesn't match. | **Blocked** |
| 2b | same | D, Thu Oct 8 | 3 CLOSED → 4 Allow matches → OPEN | **Available** |
| 2c | same | A, Wed Oct 7 | 3: the rule doesn't target A, so OPEN. | **Available** (the rule touches only D) |
| 3 | Only Block rules: Block weekly Mon (All) | B, Tue Oct 6 | 3 OPEN (no Allows) → 4 no match | **Available** |
| 3b | same | B, Mon Oct 5 | 3 OPEN → 4 Block Mon, so CLOSED | **Blocked** |
| 4 | Allow weekly Mon–Fri (All) · Block biweekly Wed from Sep 30 (Selected: B) | B, Wed Oct 14 | 3: recurring Allow, so CLOSED. 4: Allow and Block both match; Block wins. | **Blocked** |
| 4b | same | B, Wed Oct 7 | 3 CLOSED → 4 only the Allow matches (off-week for the biweekly) → OPEN | **Available** |
| 5 | Block once Sat Oct 10 (All) · Allow once Sat Oct 10 (Selected: C) | C, Sat Oct 10 | 3 OPEN → 4 none → 5: both one-time rules match; Block wins. | **Blocked** |
| 6 | Block weekly Mon (All) · Allow weekly Tue/Thu/Sat (D) · **Allow once Mon Oct 12 (All)** | D, Mon Oct 12 | 3: D has a recurring Allow, so CLOSED. 4: Block Mon matches, so CLOSED. 5: one-time Allow, so OPEN. | **Available**. A one-time rule overrides recurring rules even for a whitelisted Item. |
| 7 | Allow once Tue Oct 6 (All); A is archived | A, Tue Oct 6 | 2: archived, so stop. | **Archived** (public: unavailable). Existing bookings for A are still shown and exported. |
| 8 | Allow weekly Tue/Thu/Sat **from Nov 1** (D) | D, Wed Oct 7 | 3: the only recurring Allow starts Nov 1, so it's out of bounds and D is OPEN (Change B). | **Available** |
| 9 | none | A, Thu Oct 1, already booked once | 3 OPEN → 6: 1/1 used | **Full** (public: unavailable) |
| 10 | Block weekly Mon (All), **inactive** | A, Mon Oct 5 | Inactive rules are ignored, so OPEN. | **Available**. The rule shows muted in the list. |
| 11 | any | A, Sun Sep 27 (yesterday) | 1: before today | **Out of window**. Shown muted on the grid. |
| 12 | Timed: A has times 12:00 (60 min, cap 2) and 17:30 (60 min, cap 1). Block once Oct 15 (Selected: B) | A 17:30, Thu Oct 15, already 1 booked | 3–5: the rule doesn't target A, so OPEN → 6 per occurrence: 12:00 has 0/2, 17:30 has 1/1 | 12:00 **Available**, 17:30 **Full**. The day shows one marker for A (12:00). |

## Tests that will lock this down

- Every example above becomes a named test.
- A property-style sweep adds coverage:
  - For random rule sets across 400 days, a **Block that targets the Item and matches the date always wins within its tier** (recurring or one-time).
  - An inactive rule never changes any result.
  - A Selected-Items rule never changes the result for an Item it doesn't target.
- Edge cases from the transfer document, §27:
  - a date that falls out of the rolling window
  - a blocked Item still preserved in organizer reporting
  - date-only and timed selections together
  - timed overlap on different dates is not a conflict
