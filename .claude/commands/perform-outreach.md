---
description: Send drafted emails for Proof Sheet rows that have a verified email and a drafted message.
---

Run the **performOutreach** task handler from `Tools/outreach-agent.md`.

Steps:
1. Read `Tools/outreach-agent.md` if you do not already have the performOutreach section in context. The full protocol is under `### performOutreach`.
2. Call `read_proof_sheet` (default tab "Proof Sheet").
3. Filter to rows where ALL of these are true:
   - `contact_email` is set
   - `message` is set and begins with a `Subject:` line (as produced by `writeMessages`)
   - `email_sent` is empty
   - `contact_confidence` is `"High"` or `"Medium"` (never send to Low)
   - Note: `email_subject` column is ignored for filtering. The subject lives inside the `message` cell.
4. Print a summary before sending: `"Found <N> ready to send. Will send up to 5 this run, spaced 2 minutes apart."`
5. For each matching row, **up to a daily cap of 5**, in order:
   - Parse the subject from the first `Subject: ` line of `message`; strip that line (and the blank line after) to get the body.
   - Print `"Sending <current>/<cap>: <contact_email> — <subject>"` before each send.
   - Call `send_email` with `to = contact_email`, `subject = <parsed subject>`, `body = <parsed body>`.
   - On success, call `update_proof_sheet` to set `email_sent` to today's ISO date (YYYY-MM-DD).
   - **Wait 2 minutes between sends** (deliverability / anti-spam). Do not batch or rapid-fire.
   - On any send error, log it, do NOT mark `email_sent`. If **2 consecutive errors**, stop the run and report.
6. Report a short summary: `"Run complete. Sent <X>/<cap>. <Y> remaining unsent rows for next run."`
