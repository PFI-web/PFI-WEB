

**What this system is**

This is a private outreach automation tool built exclusively for your team. It lives at a URL you control, only your employees can access it, and it uses their own Claude accounts and LinkedIn sessions to send outreach — meaning everything comes from real people, not bots. No shared accounts, no third party sending on your behalf.

---

**Login screen**

When a team member goes to the URL the first thing they see is a grid of name cards — one card per employee on your team. You pre-load these names, roles, and Google email addresses into Firestore once. The user picks their name, clicks it, and a Google sign in button activates. When they sign in with Google, the system checks that the Google account they authenticated with matches the email address you have on file for that name. If it matches they get in. If it doesn't match they get blocked. This means nobody can pick someone else's name and access their data.

---

**Onboarding — first time only, never repeated**

After their first successful login the system detects they haven't been set up yet and routes them to a 4-step onboarding screen. This only happens once. After it's done they go straight to their dashboard every time.

Step 1 is automatically marked complete — they're already signed in so there's nothing to do.

Step 2 asks them to install Claude in Chrome. The screen shows a button that links directly to the Chrome Web Store listing. They click it, install the extension, come back and mark the step done.

Step 3 is the skill step. The system has already generated a personalized skill document for them — built by merging your company's master skill template with their name, role, and targeting criteria. The screen shows them the full text of their skill, a copy button, and a button that opens Claude Projects. They copy the text, open Claude Projects, create a new project, paste the skill into the project instructions, save it, and mark the step done. From this point forward every time Claude writes a message or performs outreach it has full context about who this person is, who they're targeting, and how to communicate.

Step 4 asks them to make sure LinkedIn is open in their browser. Claude in Chrome needs an active LinkedIn session to send connection requests. They click the button to open LinkedIn, confirm they're logged in, and mark it done.

Once steps 2 and 3 are marked done the Enter App button activates and they land on their dashboard.

---

**The skill system**

This is one of the most important parts of the system. Claude in Chrome is powerful but it needs context to write good messages. Without context it writes generic outreach. With context it writes specific, personalized messages that sound like they came from a real person who did their research.

You write the master skill once. It contains your company's value proposition, a description of who you're targeting and why, your tone rules, message length guidelines, what to never say, and format templates for both LinkedIn notes and emails. It uses two placeholders — `{{name}}` and `{{role}}` — which get replaced automatically per user.

When a user onboards the system takes your master template, replaces the placeholders with their real name and role, and saves the result as their personal skill document in Firestore. This is what they paste into their Claude Project. From that point on every message Claude generates uses this as its foundation — it knows it's writing for Sarah specifically, that Sarah is an Account Executive, that she's targeting VP of Sales at B2B SaaS companies with 50 to 200 employees, what the company does, what pain points they solve, and what tone to use.

---

**The dashboard**

The dashboard is the main screen your team spends all their time on. It is styled to match your website — same fonts, same colors, same feel — so it feels like a natural part of your product rather than a separate tool.

The top bar shows the logged in user's name, their daily send counts for both LinkedIn and email with a color indicator that turns orange when they're getting close to the limit and red when they've hit it, a Limits button to adjust their daily caps, and a sign out button.

The main content area is a table showing every person in their lead database. Each row is one lead and has six columns. Name is the lead's full name. Company is where they work. Channel shows whether this lead will be contacted via LinkedIn or email — shown as a color coded badge. Contact shows either a clickable link to their LinkedIn profile or their email address depending on the channel. Message shows a preview of the outreach message — if there's no message yet it shows a placeholder that prompts them to add one. Clicking anywhere on the message preview opens an inline text editor right in the table cell. They can edit the message directly, and when they click away it saves to Firestore instantly with no save button needed. Status shows either Done in green or Pending in gray. Clicking a Pending status manually marks that lead as done. Once a lead is marked Done it will never be contacted again by the outreach system.

---

**Find more people**

This button opens a modal. Inside the modal are four fields — job title or role, industry, company size as a dropdown, and how many leads to find. These fields are pre-filled with whatever they searched last time so they never have to re-enter their targeting criteria. They just review it, adjust if needed, and click Find. The system calls the `searchLeads` Cloud Function which runs the search, deduplicates against leads already in their database, and writes the new leads to Firestore. Because the dashboard uses a live Firestore listener the new leads appear in the table in real time without a page refresh.

---

**Seed messages**

This button calls the `seedMessages` Cloud Function. The function looks through all their leads and finds every one that has an empty message field. For each of those leads it builds a personalized message using the user's skill document as context — pulling in the lead's name, their company, and their role to write something specific to them. The messages appear in the table immediately. Every single message is editable — users are expected to review them, tweak the wording, add something specific they know about the person, or rewrite entirely. The system generates a strong starting point, the human makes it theirs.

---

**Perform outreach**

This is the button that actually sends everything. When clicked it opens a progress modal. The modal shows a summary of how many leads are ready to contact — meaning they have a message and are not marked Done. There is a Start button. When they click Start, Claude in Chrome takes over.

The system works through the queue one lead at a time. For each lead it fires a browser event that Claude in Chrome listens for. The event contains the instruction — for LinkedIn it says go to this profile URL and send a connection request with this note, for email it says open Gmail and send an email to this address with this subject line and this body. Claude in Chrome navigates to the page, performs the action, and fires back a confirmation event. The system then calls `logOutreach` in Firestore to mark that lead as done and increment the day's send counter.

There is a built-in delay between each send — roughly 3 seconds — to avoid triggering spam detection. If the system hits the daily limit for either channel mid-run it stops and shows a warning. The progress bar and status updates show in real time so the user can watch it work. When it finishes it shows a summary of how many were sent.

---

**Daily limits**

Each user has their own daily limits stored in Firestore. The defaults are 20 LinkedIn connection requests per day and 50 emails per day. These are conservative and safe numbers — LinkedIn in particular is aggressive about flagging accounts that send too many connections too fast. Users can adjust their limits by clicking the Limits button in the top bar which opens a small settings modal. The limits reset every day at midnight. The system tracks counts by storing a field per day — for example `linkedin_2025-01-15` — so it always knows exactly how many have been sent today without any scheduled jobs or cron tasks needed.

---

**The three Cloud Functions**

`searchLeads` takes the search criteria from the modal, saves them to the user's profile so they persist, runs the lead search, deduplicates against existing leads, and writes new ones to Firestore.

`seedMessages` finds all leads with empty message fields and generates personalized messages using the skill context. It writes the messages to Firestore and the table updates live.

`logOutreach` is called after each successful send. It marks the lead as done, increments the daily counter for the right channel, and enforces the limit — throwing an error if the cap has been reached so the outreach loop knows to stop.

---

**Firestore data structure**

There are two root-level paths. The `company` path holds things that apply to everyone — the master skill template and the employee list with each person's name, role, and Google email. You manage this manually in the Firebase console.

The `users` path has a folder per user keyed by their Firebase UID. Inside that folder is their profile which contains their saved search criteria and their generated skill document, their leads collection which is every lead they've ever found with all the fields the table displays, and their limits document which stores their daily caps and today's send counts.

Security rules lock this down so each user can only read and write their own data. The company path is readable by any signed in user but not writable — only you can change it through the Firebase console.

---

**What you build and deploy**

Two files. `public/index.html` is the entire frontend — the login screen, onboarding flow, and full dashboard all in one file using vanilla HTML, CSS, and JavaScript with Firebase's SDK loaded directly. It is styled to match your website. `functions/src/index.js` is the three Cloud Functions. Everything else — the Firebase config, security rules, and index files — is configuration that deploys alongside them. You run one deploy command and the whole system goes live.