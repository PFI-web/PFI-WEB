# START HERE — WE THE BEST agent briefing

**Read this file first, every time, before doing anything on the WE THE BEST shop sheet.**
It tells you where everything lives, what tools already exist (so you don't rebuild them),
and what to read to get fully up to date.

---

## 1. Read order (get up to date in 2 files)
1. **This file** — orientation, tool inventory, ground rules.
2. **`docs/cleanup-handoff.md`** — the full status doc: tab structure, every cleaning/profit
   rule, current numbers, and the live list of open/flagged items. This is the source of truth.

Then, before asserting anything about the data, **read the live sheet** (numbers in docs may be
stale) — see §4 for how.

---

## 2. GROUND RULES (do not break these)
- **NEVER edit the owner's hand-entered numbers** — Amount Paid, Part Cost, Date, Type, Tip.
  No sign flips, rounding, reformatting, or inventing values.
- You MAY add **derived** things only: formulas that *reference* the inputs (Labor, totals),
  summaries, formatting, sorting, helper tabs, flags.
- If a number looks wrong, **flag it** (red highlight + a note in Notes) — never silently fix.
- **One authorized exception:** the Apps Script may decrement `Qty Left` on Tire Inventory.
  That is the only owner-typed cell the system may write.

---

## 3. Where everything lives
```
Tools/we-the-best/
├── START-HERE.md                   ← this file
├── README.md                       human-facing overview
├── package.json                    deps note
├── node_modules ─► ../mcp-server/node_modules   (symlink — shares the install)
├── docs/
│   └── cleanup-handoff.md          full status / rules / open items  (READ #2)
├── scripts/                        REUSABLE tools (run these)
│   ├── summary-tab.mjs
│   ├── labor-and-daily-profit.mjs
│   └── one-time/                   already-ran historical scripts (reference only)
└── apps-script/
    ├── we-the-best-onedit.gs       owner pastes this into the sheet by hand
    ├── tire-intake.gs              tire-receiving web app (server) — owner adds + deploys
    └── tire-intake-page.html       tire-receiving web app (the texting UI)
```
- **Spreadsheet:** `WE THE BEST - transactions`, ID `1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4`
- **Auth key:** `thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json` at the **repo root** (do not move).
- **Tabs (in order):** Transactions (Jun 13+) · Tire Inventory · Parts Inventory · Summary ·
  then 4 raw backups. (Full schema in the handoff doc.)
- **Jun 13+ money columns (since 2026-06-29):** `C Amount Paid · D Part Cost · E Profit` then
  `F Date · G Type · H Tip · I Notes · J Inv Item`. **Profit = Amount Paid − Part Cost** (derived;
  Amount Paid already includes the labor, so subtracting part cost leaves the profit). The Labor
  column was removed (it always equaled Profit since parts pass through at cost). Daily "Total made"
  rows live in the **Profit** column (E).

---

## 4. How to run (and read the sheet)
```sh
cd Tools/we-the-best/scripts      # or scripts/one-time for historical ones
node summary-tab.mjs              # example
```
- `googleapis` is already installed (resolved via the `node_modules` symlink) — **do not
  `npm install` or rebuild deps**; just run the script.
- To read the live sheet for a quick look, copy the auth/connect boilerplate from the top of any
  script (e.g. `scripts/summary-tab.mjs`) and call `sheets.spreadsheets.values.get(...)`.

---

## 5. TOOLS THAT ALREADY EXIST — check here before building anything

### Reusable (`scripts/`) — run these directly
| Tool | What it does | When to run |
|------|--------------|-------------|
| `summary-tab.mjs` | Rebuilds the **Summary** tab (profit by type & month, inspection stickers, net). Re-inserts Summary right after Parts Inventory. | After ANY edit to the transaction tabs. |
| `labor-and-daily-profit.mjs` | Sets the Labor `$` formula on every Jun 13+ row and writes each day's pure-profit total into the gap rows. | After editing June amounts/costs. |

### Already done (`scripts/one-time/`) — don't re-run unless you know why; reuse as templates
- **Cleaning past data:** `clean-sheet1.mjs`, `clean-sheet2.mjs`, `clean-tires.mjs`,
  `add-day-0620.mjs`, `clean-new-days.mjs`, `clean-days-0623-0627.mjs`.
- **Inventory system build:** `build-parts-inventory.mjs`, `build-link-step2.mjs`,
  `build-link-step3.mjs`, `make-tires-easy.mjs`, `finish-tires-easy.mjs`, `merge-tire-qty.mjs`.
- **Helpers:** `mine-parts.mjs`, `inspect-for-build.mjs`, `fix-daily-totals-formula.mjs`.

### Common task → reach for this
- **Receiving tires (stock coming IN)?** Use the **Tire Intake web app**
  (`apps-script/tire-intake.gs` + `tire-intake-page.html`). Phone page: pick **Nueva / Usada**
  (sticky toggle), then type a size any way ("225 45 17", "225/45R17", "4 225 45 17"). It
  standardizes to `WWW-AA-DD` and writes the **combined label `"<size> <Nueva|Usada>"`** into
  Tire Inventory col **A** (e.g. `225-45-17 Usada`), Qty on Hand in col **B**. New and Used of a
  size are **two separate rows / sellable lines**; same size+condition bumps its count, a first-time
  size+condition appends a row. Bad input -> "no entendí, escríbelo otra vez", nothing written.
  Sales are NOT here — they stay in the sheet's Inv Item dropdown (mom now picks the exact
  size+condition, and the count drops from that bucket) so the profit link holds. The combined
  label IS the dropdown value, so **`we-the-best-onedit.gs` and the catalog FILTER need no
  changes** (they match col A exactly, decrement col B). Catalog FILTER widened to
  `Tire Inventory!A2:A100` (each size can take 2 rows now); dropdown validation is `G3:G400`, room
  to spare. Add to a SECOND deployment of the SAME bound project (Deploy -> Web app, Execute as
  owner, Access Anyone); owner pastes both files by hand. Inventory labels are Spanish
  (Nueva/Usada) to match mom's sale dropdown — flip in `normCondition`/the toggle if English is wanted.
- **Owner adding a new day?** This is now **self-service via the Apps Script** — no agent needed.
  The owner just types/pastes the day's rows; `we-the-best-onedit.gs` auto-fills **Labor (D)** and
  **Profit (F)** on each row, and typing `total` in column A of a blank row builds the
  "Total made (profit) <date>" row. (Per-row Labor only fills if blank, so typed labor is kept.)
  After a batch, anyone can still run `summary-tab.mjs` to refresh the monthly Summary.
- **Cleaning messy *text* in pasted days** (Spanish→English, payment/type normalization) still
  needs a script: copy `scripts/one-time/clean-days-0623-0627.mjs` as a template. ⚠️ It predates
  the layout changes — use the **current layout**: Part Cost=**D**, Profit=**E**, Date=**F**,
  Type=**G**; the onEdit script now handles the Profit formula and daily totals, so a text-cleaner
  shouldn't rewrite E.
- **Just need fresh numbers?** Run `summary-tab.mjs`.
- **Inventory linking changed?** The logic is in `apps-script/we-the-best-onedit.gs` — the owner
  must paste it into Extensions → Apps Script by hand (it is NOT deployable via the service
  account). Build scripts already set up the tabs/dropdowns.

---

## 6. Before you finish
- After editing the sheet, **rerun `summary-tab.mjs`** so the Summary reconciles.
- If you cleaned new days or resolved/added flagged rows, **update `docs/cleanup-handoff.md`**
  (current numbers + the open-items list) so the next session stays accurate.
