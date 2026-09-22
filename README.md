# CryptOji (MERN, real-time, MongoDB Atlas)

Emoji-clue tech quiz for individual participants (1st and 2nd year only). Everyone plays at
**one shared link** and logs in with the email they registered with — no codes, no per-person
links, no manual roster entry. Each participant gets their own randomized board (three difficulty
columns; you set each question's point value yourself, it isn't fixed by difficulty).
Winners are decided when the event ends (or automatically, if you set a schedule), and are shown
**only** on the admin page.

## 1. Requirements
- Node.js 18.11 or newer
- A MongoDB Atlas cluster (free tier is enough). This app does **not** use a local MongoDB —
  it needs a cloud connection string because you're deploying and sharing a public link.
  1. Create a free cluster at https://www.mongodb.com/cloud/atlas
  2. Database Access → add a database user with a password
  3. Network Access → add `0.0.0.0/0` (allow from anywhere) — required once you deploy, since
     you won't know your host's IP in advance
  4. Connect → Drivers → copy the connection string (`mongodb+srv://...`)

## 2. Setup (once)
```bash
cd cryptoji-mern
npm run setup                    # installs server + client
cp server/.env.example server/.env
# edit server/.env:
#   MONGO_URI       -> your Atlas connection string, with a database name at the end
#   ADMIN_PASSWORD  -> required
```

## 3. Run it

**Event mode (one address for everybody, this is what you deploy)**
```bash
npm run build      # builds the React app into client/dist
npm start          # Express serves the app + API + websockets on one port
```

**Development mode** (hot reload): terminal 1 `cd server && npm run dev`, terminal 2
`cd client && npm run dev`, open `http://localhost:5173`.

**Deploying so it's reachable by phones over the internet**, not just your own Wi-Fi: push this
repo to GitHub and deploy the `server` folder to Render, Railway, or similar (Node web service,
build command `npm run setup && npm run build`, start command `npm start`, and set `MONGO_URI` /
`ADMIN_PASSWORD` as environment variables there — never commit `.env`). You'll get one public
`https://...` URL. That URL *is* the one link you share with everyone, for both years.

## 4. Getting participants in from your Google Form

1. Your form should collect: Name, Year, Department, Email, Phone, Register/Roll number, and
   optionally a Slot/Batch — in **any column order**. Columns are matched by header text, not
   position, so it doesn't matter which order your form's fields come in or what they're
   exactly worded ("Email ID", "E-mail", "Register Number", "Roll No." all match).
2. Open the form's linked Responses spreadsheet → File → Download → **Comma Separated Values
   (.csv)**.
3. Admin page → **Participants** tab → **Import participants** → upload that CSV (or paste its
   contents directly into the text box, no file needed).
4. Only rows where Year resolves to 1st or 2nd are imported; everything else is reported back to
   you as skipped, with a reason, so you can fix and re-export if needed.
5. **Login is by email only.** Nothing is generated or distributed — participants just type the
   email they used on the form. Re-importing later (more form responses came in) skips emails
   already on the roster, so it's safe to re-run.

## 5. Event-day runbook
1. Open `/admin`, sign in with `ADMIN_PASSWORD`.
2. **Participants** tab: import your CSV (above).
3. **Questions** tab: add your own, or click **Load the 20 sample questions**. Each question has
   its own point value that you set directly - difficulty (easy/medium/hard) only decides which
   board column it sits in, it no longer fixes the points automatically. Changing the difficulty
   dropdown suggests that tier's usual value (10/20/30) as a starting point, but you can type
   anything from 1 to 1000.
4. **Event** tab:
   - Set seconds per clue, the violation penalty, and how many violations a participant may
     have and still be eligible to win.
   - Either click **Start event now**, or set a **scheduled start/end** time and let it begin and
     finish on its own — this also means that if the server restarts mid-event (a redeploy, a
     crash, a lost connection), everything resumes correctly on its own once it's back, with no
     admin action needed.
5. Watch the **Participants** tab: points, violations, who's mid-clue, and per-person access logs
   (Details). **Reset device** lets someone switch phones if theirs died.
6. **End event now**, or let the scheduled end time do it. The **Winners** tab shows the podium
   and full standings — only participants within the violation limit are eligible; if two are
   tied on points they share the same place (both "1st", next distinct score is "3rd").
7. **Reset event** (Event tab) is available at any time, in any status, including after the event
   has ended — pick whether to keep the roster and questions, or clear everything, and run it
   again.

`/scoreboard` is an optional public live scoreboard for a projector. It shows points only and goes
blank when the event ends — winners are never shown there or to participants, only in `/admin`.

## 6. How each requirement is implemented
| Requirement | Implementation |
|---|---|
| No manual entry, roster from Google Form | CSV import matched by header keyword; only email is the login key, so name/spelling never causes a conflict. |
| One device per participant | First browser to log in with an email is bound to it; a second device is refused (logged, with IP/browser). Admin can **Reset device**. |
| Resume after any interruption | Event start/end times and each participant's clue deadline are stored on the server and computed from the server clock, not memory or the browser clock — a refresh, dropped connection, or full server restart resumes exactly where it left off. |
| Admin reset, event never permanently locked | **Reset event** works in any status (setup/live/ended), with a choice of what to clear. |
| Mobile + desktop responsive | Fluid layout, 44px touch targets, safe-area padding for notches, single link works on any phone/desktop browser — fullscreen is used where the browser supports it (most Android browsers) but is never required, so iPhone Safari (which has no fullscreen API for arbitrary pages) still works fully. |
| One common link for everyone | No per-team/per-person URLs; the deployed root URL is shared as-is. |
| Violation locks the clue | Any tracked violation (leaving the screen, copy/paste, right-click, losing fullscreen) locks the current clue at 0 points if the penalty is set to "lock". |
| Violations hidden from participants | The participant screen only ever shows a generic "your clue was locked" message — no count, no history. Full detail is admin-only, per person. |
| Winner eligibility | More than the configured violation limit (default 5) excludes a participant from the podium, but they still appear in the full standings, flagged. |
| MongoDB Atlas, not local | `MONGO_URI` must be an Atlas `mongodb+srv://` string; the server refuses to start without it. |
| Clear end-of-attempt action | Once every clue is attempted, a **Submit** button appears; submitting locks in their final score, releases them from the anti-cheat watchers (safe to close the tab), and marks them "submitted" on the admin Participants tab. |

**Randomization:** each participant gets their own shuffled tile order inside each tier, and
their own shuffled answer-option order, so neighbours can't compare boards.

## 7. Limits you should know about
- Browser-side controls are deterrents, not proof against a second device (e.g. a phone next to a
  laptop). The short server-enforced timer and per-participant randomization are the real
  defence; consider a camera-on call for anything higher-stakes.
- If a participant's clue is running when the event ends, it counts as timed out.
- I wasn't able to test this against a live MongoDB instance in the environment I built it in (no
  network path to a Mongo binary or Atlas from there) — the server modules load cleanly, the
  client builds cleanly, and I traced every request path by hand, but do a dry run with 2-3 test
  participants against your real Atlas cluster before the actual event, then use **Reset event**
  to clear the test data.
- CSV import trusts your form's data (email format is validated, year is validated, everything
  else is stored as-is) — duplicate or malformed rows are skipped and listed, not silently
  dropped.
