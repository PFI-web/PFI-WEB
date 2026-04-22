---
description: Draft personalized learning-outreach messages (email or LinkedIn note) for Learning Track rows that don't have one yet.
argument-hint: "[count]"
---

Run the **writeLearningMessages** task handler from `Tools/PFI_Learning_Track_Addition.md`.

Count: $ARGUMENTS

Steps:
1. Read `Tools/PFI_Learning_Track_Addition.md` for the full protocol. The handler is under `## Task Handler: writeLearningMessages`.
2. Call `read_proof_sheet` with `tabName: "Learning Track"`.
3. Filter to rows where `message` is blank. Process up to **$ARGUMENTS** rows.
4. For each row, draft a message per the protocol:
   - Identity: Penn State student researching permitting delays
   - Hedge on the contact's role/work (signal genuine research, not a bot)
   - Connect their work to current jurisdictional context
   - Ask question(s) drawn from the four hypothesis categories (A: is the problem real? B: is it unsolved? C: who takes the financial hit? D: does lack of broader visibility cause real impact?)
5. **Channel routing — non-negotiable:**
   - `channel: email` → write subject line + body into `message`. Max 3 questions.
   - `channel: linkedin` → write LinkedIn connection note (≤300 chars) into `message`. Exactly ONE question.
   - Never write both for the same contact.
6. Write back via `update_proof_sheet` with `tabName: "Learning Track"`.
7. Report a short summary: messages drafted, channel breakdown, skips.
