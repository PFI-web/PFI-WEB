---
description: Find N ground-level operators (permit expediters, NEPA consultants, land use attorneys, etc.) for the Learning Track tab.
argument-hint: "[count]"
---

Run the **findLearningContacts** task handler from `Tools/PFI_Learning_Track_Addition.md`.

Count: $ARGUMENTS

Steps:
1. Read `Tools/PFI_Learning_Track_Addition.md` for the full protocol. The handler is under `## Task Handler: findLearningContacts`.
2. Follow the same project discovery pipeline as proofSheet (Tier 1/2/3 sources, constraint filter, Active Pain priority) — but instead of looking for fund-level contacts, find ground-level operators tied to those projects.
3. Priority order: independent permit expediters → environmental consulting (NEPA/EIS) → land use attorneys → interconnection consultants → current/former agency staff.
4. **Do NOT target** anyone at the institutional backer, anyone employed by the developer, EPCs tied to a single developer, or capital-raising roles.
5. Run the jurisdiction-expertise verification search before Playwright, then verify name + employer + current status via Playwright.
6. Enrich for email via Apollo (LinkedIn-only is acceptable). Set `channel` based on whether Apollo returned an email.
7. Write rows to the **"Learning Track"** tab via `write_proof_sheet` (`tabName: "Learning Track"`). Dedup by LinkedIn URL against existing rows.
8. Report a short summary: contacts written, contacts skipped (with reason).

**Critical:** Learning Track contacts must NEVER be promoted to the Outreach Track pipeline. They are a separate audience with a separate purpose (learning, not selling).
