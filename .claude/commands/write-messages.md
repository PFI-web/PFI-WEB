---
description: Draft first-contact emails for Proof Sheet rows that have a verified email but no message yet.
argument-hint: "[count]"
---

Run the **writeMessages** task handler from `Tools/outreach-agent.md`.

Count: $ARGUMENTS

Steps:
1. Read `Tools/outreach-agent.md` if you do not already have the writeMessages section in context. The full protocol is under `### writeMessages`.
2. Read the Proof Sheet via `read_proof_sheet` (default tab "Proof Sheet").
3. **Walk the sheet in order, top to bottom. Do NOT reorder. Do NOT batch by confidence. Do NOT cherry-pick.** For each row, in the order it appears in the sheet, apply this decision:
   - If `message` is already set → skip (already done)
   - Else if `key_contact` is empty or equals `"contact not found"` → skip (no contact to write to)
   - Else if `contact_email` is empty → skip (Outreach Track is email-only — no LinkedIn fallback)
   - Else if `contact_confidence` is `"Low"` → skip (flagged: do not send outreach)
   - Else → **draft the email and update the row immediately, before moving to the next row**
4. Stop once you have drafted **$ARGUMENTS** messages, or when you reach the end of the sheet.
5. For each row that qualifies, draft an email per the full protocol in `outreach-agent.md` → `### writeMessages`. Do not paraphrase the protocol — follow the email structure (Hey <first name>, soft curious "help me understand" opening, "I ask because at PFI…" paragraph, the 20-minute ask, the full-disclosure close, `Best,` sign-off) and the step-8 claim audit exactly as written there.
6. **Per-row write — IMMEDIATE, ONE AT A TIME, NEVER BATCHED.** As the very next tool call after each draft is finalized:
   - Call `update_proof_sheet` with `tabName: "Proof Sheet"` for that single row, matching by `company`.
   - Put the **full email** into the `message` field formatted as `Subject: <subject>\n\nHey <first name>,\n\n<body>\n\nBest,`.
   - **Leave `email_subject` blank.** The subject lives inside `message` as the first line. Writing it into `email_subject` too is forbidden (duplicate state).
   - Do NOT touch `linkedin_note` or `email_sent`.
   - **Confirm the tool returned `Updated 1 row(s)`.** If it returns `Updated 0 row(s)` or `Not found`, STOP and report — do not move to the next row.
7. Only after the write is confirmed, move to the next qualifying row.
8. Report a final summary: how many rows drafted-and-written, exact row numbers skipped, the specific skip reason for each, and any write failures.
