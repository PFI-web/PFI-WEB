---
description: Send drafted learning emails for Learning Track rows with channel=email and a drafted message.
---

Run the **performLearningOutreach** task handler from `Tools/PFI_Learning_Track_Addition.md`.

Steps:
1. Read `Tools/PFI_Learning_Track_Addition.md` for the full protocol. The handler is under `## Task Handler: performLearningOutreach`.
2. Call `read_proof_sheet` with `tabName: "Learning Track"`.
3. Filter to rows where `message` is set AND `channel` is `email` AND there is an email address.
4. For each matching row:
   - Extract the subject line (first line of `message`) and body (everything after the blank line).
   - Call `send_email` with `to = email`, the extracted subject, and the extracted body.
   - Wait ~3 seconds between sends.
   - On error, log it and continue.
5. **LinkedIn-channel rows are NOT sent here.** The user sends those manually.
6. Report a short summary: how many emails sent, how many failed.
