---
description: Find N projects with permitting friction, research them, and write rows to the Proof Sheet.
argument-hint: "[count]"
---

Run the **proofSheet** task handler from `Tools/outreach-agent.md`.

Count: $ARGUMENTS

Steps:
1. Read `Tools/outreach-agent.md` for the full protocol. The handler is under `### proofSheet`.
2. **First, honor the "Run sizing & saturation" block at the top of the proofSheet handler.** Call `read_proof_sheet` to see how many rows already exist. If the sheet already has 100+ rows AND $ARGUMENTS > 15, **stop and confirm scope with the user before continuing** — the tail is structurally expensive and a large inline batch is the wrong venue.
3. Otherwise, follow steps 1–11 of the proofSheet handler exactly: source-tier discovery, constraint filter, quick backer gate, full backer lookup, situational intelligence, contact verification via Playwright, Apollo enrichment, write rows incrementally via `write_proof_sheet`.
4. Watch the saturation bail-out: if you burn 30+ searches without writing a new row, or 3 consecutive candidates fail verification, stop and report saturation. Never lower the verification bar to fill the count.
5. Report a short summary: rows written, rows skipped (with reason), saturation status.
