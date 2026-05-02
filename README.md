# SER Technical Team - Staff Portal & Automation Tools

**Owner:** Dr Liam T. Pearson-Noseworthy  
**Department:** School of Sport, Exercise & Rehabilitation, Northumbria University  
**Last updated:** May 2026 (rev. 4)  

---

## What this project is

A set of tools that reduce manual admin for the SER technical team. Three main components:

1. **Staff portal** (`index.html` + 10 topic pages) - an internal multi-page web portal hosted on SharePoint/Teams with a live calendar, workflow map, teaching alignment tracker, editable topic pages (Teaching, Research, Ethics, Risk Assessment, Workflows, Lab & Equipment, Inductions & Training, PEPs, Timetabling, SiSo Bookings) and an A-Z links sidebar.
2. **SiSo room booking automation** (`run_in_console.js`) - a browser console script that scrapes MyTimetable and pushes bookings directly to SiSo.
3. **Teaching alignment tracker** (`Semester1.html`, `Semester2.html`) - editable per-module session tables backed by Firestore, populated by the MyTimetable import.

---

## Files in this project

| File | What it does |
|---|---|
| `index.html` | Main staff portal homepage. Topic nav bar (10 topic pages + Participant Bank), workflow map link, teaching alignment links, A-Z links sidebar, live Google Calendar widget |
| `teaching.html` | Topic page: Teaching. Editable subsections + shared sidebar |
| `research.html` | Topic page: Research |
| `ethics.html` | Topic page: Ethics |
| `risk-assessment.html` | Topic page: Risk Assessment (pre-populated with SharePoint Risk Assessment Library link, RA contact, how-to guidance, FAQs incl. biennial review cadence) |
| `workflows.html` | Topic page: Workflows (links out to interactive `workflow.html` map) |
| `lab-equipment.html` | Topic page: Lab & Equipment |
| `inductions.html` | Topic page: Inductions & Training |
| `peps.html` | Topic page: PEPs (Practical Exercise Protocols) |
| `timetabling.html` | Topic page: Timetabling |
| `siso.html` | Topic page: SiSo Bookings |
| `Semester1.html` | Teaching alignment tracker for Semester 1. Editable, Firebase-backed |
| `Semester2.html` | Teaching alignment tracker for Semester 2. Editable, Firebase-backed |
| `participant-matcher.html` | Standalone participant database & researcher matcher. Public registration tab + PIN-gated researcher tab. Firebase-backed; uses EmailJS for invitations. Intentionally isolated (no nav back to portal) |
| `workflow.html` | Interactive departmental workflow map. Firebase-backed. Header matches site design with a "← Portal" back link to `index.html`. **NOTE:** This file is maintained in the separate `LiamTP-N/School_of_SER` GitHub repo and must be deployed alongside the other HTML files for the Workflow Map links to resolve. |
| `run_in_console.js` | Scrapes MyTimetable and produces a SiSo-ready CSV download (Phase 1b - replaces the older `v2_siso_importer.py` Python script) |
| `import_to_firebase.js` | Scrapes MyTimetable and writes sessions directly to Firestore (populates Semester1/2.html) |
| `README.md` | This file |
| `SiSo_Project_Memory.md` | Full technical context and decision log for the SiSo automation project |
| `SiSo_Session_Handover_2026-04-29.md` | Detailed technical notes from the April 2026 build session that produced `run_in_console.js` |

---

## Deploying the portal

All HTML files are static - no server needed. Host them together in the same SharePoint document library or Teams Files tab so relative links between them work.

**All HTML files must be in the same folder:**
```
index.html
teaching.html
research.html
ethics.html
risk-assessment.html
workflows.html
lab-equipment.html
inductions.html
peps.html
timetabling.html
siso.html
Semester1.html
Semester2.html
participant-matcher.html
workflow.html  (deploy from the separate LiamTP-N/School_of_SER repo)
(run_in_console.js, import_to_firebase.js can live anywhere)
```

---

## Complete setup checklist (new deployment or new academic year)

Work through this list in order. Each step has its own section below.

- [ ] 1. Deploy HTML files to SharePoint
- [ ] 2. Confirm Firebase project is live
- [ ] 3. Run the MyTimetable import to populate Semester 1 and Semester 2
- [ ] 4. Staff fill in the manual columns (Academic, PEP, Set-up, Support, Food)
- [ ] 5. Update academic year constants for the new year
- [ ] 6. Run `run_in_console.js` to generate the SiSo CSV and upload to SiSo

---

## 1. Staff portal (index.html + topic pages)

Open `index.html` in a browser directly from SharePoint. The homepage includes:

- **Topic navigation bar** (top of white area) - 10 buttons each linking to a dedicated topic page (Teaching, Research, Ethics, Risk Assessment, Workflows, Lab & Equipment, Inductions & Training, PEPs, Timetabling, SiSo Bookings). Each topic has its own URL so they're shareable and bookmarkable.
- **Workflow Map banner** - links to `workflow.html`
- **Teaching Alignment banners** - two side-by-side boxes linking to `Semester1.html` and `Semester2.html`
- **Calendar widget** - pulls live room booking data from Google Calendar via the service account. Defaults to 1-day view; toggle to 3-day or 5-day with the buttons in the calendar toolbar.
- **A-Z Links sidebar** - staff can add, edit and delete links. Every link has both an `edit` and an `x` (delete) button. Changes save to Firestore instantly.

The department name in the header is a clickable link back to `index.html` from the semester pages.

### Topic pages

Each topic page (e.g. `risk-assessment.html`) contains 6 editable sub-sections:

1. Overview
2. Key Contacts
3. How-To Guides
4. FAQs
5. Documents & Templates
6. Process Diagram / Flowchart

Note: the A-Z "Useful Links" sidebar on `index.html` is a separate Firestore collection (`links`), not a per-topic subsection. Editors can add, edit and delete those links from the homepage sidebar directly.

Each sub-section has a small `edit` button. Clicking it opens a modal that requires the editor's name and accepts plain text or basic HTML. After saving, "Last edited by [name] on [date]" is shown beneath that sub-section. The editor's name is remembered in the browser's `localStorage` so they only have to type it once.

All topic content lives in the Firestore `topics` collection. Edits made on one topic page are immediately visible on every page that references that topic (and to anyone else opening the portal).

**Risk Assessment** is pre-populated with: SharePoint Risk Assessment Library link, RA contact (Dr Liam T. Pearson-Noseworthy), how-to guidance for finding/creating/updating RAs, and FAQs (incl. biennial review cadence).

### Adding a new topic

There is no longer a build script - topic pages are maintained directly. To add a new topic:

1. Copy an existing topic page (e.g. `teaching.html`) and rename it (e.g. `mynewtopic.html`)
2. In the new file, change `PAGE_TOPIC_KEY` to the new slug (e.g. `'mynewtopic'`)
3. Update the page `<title>` and the strap line beneath the header
4. In the same file, add a matching object to `DEFAULT_TOPICS` for the new topic (`key`, `name`, `order`, `customSections:[]`, `subsections:{...}` with at minimum `overview:sub('...')`)
5. Add the matching `<a class="topic-btn" href="mynewtopic.html">My New Topic</a>` button to the `<nav class="topic-tabs">` block in **every** topic page AND in `index.html`. The 10 buttons must be present and identical on all 11 pages.
6. Also update the `DEFAULT_TOPICS` array on every other topic page so the new topic seeds correctly regardless of which page first triggers the seed
7. If the `topics` Firestore collection has already been populated, either delete it (it will re-seed on next page load) or manually add the new doc in the Firebase Console

---

## 2. Teaching Alignment (Semester1.html / Semester2.html)

The teaching alignment pages replace the old XLSX workbooks. All data lives in Firebase Firestore so any staff member with access to the URL can view and edit.

### How the page works

- **Left panel** lists all module codes. Click a code to show only that module's session table in the main panel - everything else stays hidden.
- **Staff filter panel** appears between the module list and the table when a module is selected. It shows all unique academics for that module as clickable pills. Click a name to filter rows to that person; click "All" to reset.
- Every cell is editable - click it, type, press Enter or click away. Saves to Firestore automatically.
- Add rows with the "+ Add row" button at the bottom of each module's table.
- Delete rows with the × button on the right of each row.
- Add entirely new modules with "+ Add module" in the page header.
- Delete a module (and all its sessions) with the × in that module's header bar.

### Columns

| Column | Source | Who fills it in |
|---|---|---|
| Academic | Manual | Tech team |
| Date | Timetable import | Auto (from `import_to_firebase.js`) |
| Start | Timetable import | Auto |
| Finish | Timetable import | Auto |
| Lab / Room | Timetable import | Auto |
| Tech setup? | Manual | Tech team |
| Tech support? | Manual | Tech team |
| PEP | Manual | Tech team |
| Food? | Manual | Tech team |

The columns Wk and Repeats were removed in rev. 3; repeated dates/times in adjacent rows already indicate repeat sessions. Tech setup? and Tech support? were briefly removed and then re-added in rev. 3 per staff feedback (set-up and support detail did need their own structured columns rather than being folded into PEP / Notes).

**Field-name mapping (AI/LLM context):**
The HTML's embedded `SEED_DATA` JSON carries these fields under their original spreadsheet names `setup` and `support` (because that's how the source XLSX exported them). The Firestore document schema, and therefore the rendered table, uses `techSetup` and `techSupport`. The seed-write loop in each Semester page maps `setup -> techSetup` and `support -> techSupport` at write time. `import_to_firebase.js` writes `techSetup` / `techSupport` directly. If you ever see blank Tech setup? / Tech support? cells across the board after a re-seed, this mapping is the first place to check.

### First load / seed data

Each page has a `SEED_DATA` constant embedded in the HTML - this is the data extracted from the original XLSX workbooks (with cleanups applied: see "Seed cleanups" below). On the very first load, if Firestore is empty for that semester, the seed data is automatically written to Firestore. After that, Firestore is the source of truth and the seed data is ignored.

A document `sem1_meta/seeded_v6` (or `sem2_meta/seeded_v6`) in Firestore records whether the current seed version has run. If you need to re-seed (e.g. after editing `SEED_DATA` in the HTML), bump the doc id to the next version (`seeded_v7`) **everywhere** in the file - the constant near the top of the seed block AND the `version: 6` value in the setDoc call - and the next page load will re-seed automatically. Existing edits in the affected `semN_sessions` collection will be wiped, so back up first if any manual entries are worth keeping.

### Seed cleanups (rev. 3)

The seed data was cleaned up in rev. 3:

- **"As Above" / blank dates and times** were replaced with explicit per-row values (inherited from the most recent populated row in the same week). Every row now has its own date, start and finish.
- **Multi-room and multi-academic separators** were normalised from `/` to ` & `, e.g. `SPF110 / SPF 113` -> `SPF110 & SPF 113`, `Liam Pearson/Chris Buckley` -> `Liam Pearson & Chris Buckley`. Slashes inside PEP URLs and dates were left untouched.

### Empty modules (rev. 3)

Modules with zero sessions used to render as a broken-looking layout (collapsed-width header + a confusing dummy row). Now they render as a normal-looking module block with the header, an empty placeholder strip ("No sessions yet - click + Add row below to add the first one"), and the standard `+ Add row` button. When the user adds the first real row, the placeholder strip disappears. If they delete back to zero rows, it returns.

Empty modules are stored in Firestore as a single doc carrying `_placeholder: true`; the loader registers the module but never shows that doc as a session row. The placeholder is auto-deleted when the first real row is added.

---

## 3. Populating the teaching alignment from MyTimetable

MyTimetable is behind Northumbria SSO login - there is no public API and no way to automate this without a live authenticated session. The import requires someone to be logged in.

**This needs to be done:**
- At the start of each semester (after timetabling publishes)
- Any time timetable changes happen mid-semester

### How to run the import

1. Go to `https://mytimetable.northumbria.ac.uk/schedule` and log in
2. Press `F12` → Console tab
3. Open `import_to_firebase.js`, select all, copy, paste into the console, press Enter
4. A blue status banner appears top-right. It will say: Subscribing → Fetching → Parsing → Checking Firestore → Writing
5. When it turns green ("Done! X new sessions added"), reload `Semester1.html` or `Semester2.html`

**What it does:**
- Subscribes to all 16 SER lab rooms in MyTimetable
- Fetches the full year's timetable
- Routes sessions to `sem1_sessions` or `sem2_sessions` in Firestore based on the date
- Skips any session already in Firestore (identified by module + date + start + room) - never overwrites manual edits
- Leaves Academic, PEP, Set-up, Support, Food blank for staff to fill in
- Unsubscribes from all rooms afterwards so MyTimetable view is unchanged

**If something goes wrong:** Set `DEBUG = true` at the top of `import_to_firebase.js` before running - it will download a `.txt` debug file. See `SiSo_Session_Handover_2026-04-29.md` for diagnostics.

---

## 4. SiSo room bookings (run_in_console.js)

This script produces a CSV ready for upload to SiSo's Booking Importer. It is separate from the teaching alignment import - it produces the booking records SiSo needs to formally reserve the rooms.

### How to use

1. Go to `https://mytimetable.northumbria.ac.uk/schedule` and log in
2. Press `F12` → Console tab
3. Open `run_in_console.js`, select all, copy, paste, press Enter
4. Wait ~30-60 seconds. A `siso_import_YYYY-MM-DD.csv` file downloads automatically.
5. Spot-check a few rows against MyTimetable
6. Upload to SiSo's Booking Importer

### What the CSV contains

| Column | Value |
|---|---|
| Quantity | `1` |
| Start | HH:MM |
| End | HH:MM |
| Date | dd/mm/yyyy |
| EndDate | dd/mm/yyyy |
| Asset | Long-form room name (e.g. `SPF 109 (Sprint Track Laboratory)`) |
| Notes | Module code |
| BookedTo | `145368` (Liam's SiSo user ID) |
| Courses | Module code |
| Reference | (blank) |

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "No CSRF token found" | Not fully logged in | Log in to MyTimetable, then re-run |
| "Unexpected response: //EX[..." | MyTimetable upgraded - body hash changed | See `SiSo_Session_Handover_2026-04-29.md` → Diagnostics |
| "No bookings found" | Subscribe failed or format changed | Set `DEBUG = true`, re-run, send the `.txt` file for diagnosis |
| CSV downloads but rooms are wrong | New room not in `ROOM_MAP` | Check console for "unmapped room" warnings, add to `ROOM_MAP` in the script |

---

## 5. Annual maintenance (start of each academic year)

Update these constants across the scripts and HTML files:

### `run_in_console.js` and `import_to_firebase.js`

```javascript
var AY_PREFIX = 'NUN1AY2526';  // change to NUN1AY2627 for 2026/27
```

Format: `NUN1AY[last 2 of start year][last 2 of end year]`

### `import_to_firebase.js`

`SEMESTER_DATES` and `AY_PREFIX` are now **calculated automatically** - no manual update needed. The script derives the current academic year from today's date and finds the Monday on or after Northumbria's typical semester start dates (22 Sep for Sem 1, 26 Jan for Sem 2). It logs the detected dates to the browser console when it runs so you can verify.

Nothing in `import_to_firebase.js` needs updating at the start of each academic year.

### Firebase - reset seed flags for new semester data

If XLSX data has been updated and you need to re-seed Firestore:

1. Go to [Firebase Console](https://console.firebase.google.com) → `nu-school-of-sport` project
2. Firestore Database → `sem1_meta` collection → delete the `seeded_v6` document (or whichever version is current)
3. Repeat for `sem2_meta`
4. Reload `Semester1.html` / `Semester2.html` - they will re-seed automatically

To force a re-seed across all installs without manual Firebase work, edit the meta doc id in the HTML (search for `seeded_v6` and replace with `seeded_v7`, also bumping the `version: 6` number to `7`) and re-deploy. The next page load anywhere will re-seed.

To reset the topic pages or A-Z links to defaults, delete the `topics` or `links` Firestore collections - they will re-seed on next page load.

---

## 6. Firebase project details

All data (workflow map, teaching alignment, A-Z links, topic pages) lives in the same Firebase project.

| Setting | Value |
|---|---|
| Project name | `nu-school-of-sport` |
| Project ID | `nu-school-of-sport` |
| Firestore collections | `sem1_sessions`, `sem2_sessions`, `sem1_meta`, `sem2_meta`, `links`, `topics` |
| Auth | Anonymous (no login required - portal is access-controlled by SharePoint) |

### Collection shapes

- `links` - one doc per A-Z link: `{ name: string, url: string }`
- `topics` - one doc per topic, doc ID = topic slug (e.g. `risk-assessment`):
  ```
  {
    name: 'Risk Assessment',
    order: 4,
    customSections: [],
    subsections: {
      overview:  { html: '...', editedBy: 'Liam', editedAt: <ms>, hidden: false },
      contacts:  { html: '...', editedBy: '...',  editedAt: <ms>, hidden: false },
      howto:     { ... },
      faqs:      { ... },
      documents: { ... },
      diagram:   { ... }
    }
  }
  ```
- `semN_sessions` - one doc per session row: `{ moduleCode, moduleName, moduleLead, techLead, week, repeats, academic, date, start, finish, room, pep, techSetup, techSupport, food, _order }`. Empty modules carry a single doc with `_placeholder: true`.

The Firebase config (API key etc.) is embedded in each HTML file. This is intentional - the API key only grants access to Firestore, and Firestore security rules restrict what can be read/written. The portal relies on SharePoint's access control for security.

**If you need to revoke or regenerate Firebase credentials:** Go to Firebase Console → Project Settings → Service accounts. The web API key is in Project Settings → General.

---

## 7. Google Calendar (index.html)

The calendar widget on `index.html` uses the Google Calendar API with a service account - it does not require staff to log in.

| Setting | Value |
|---|---|
| Service account | `siso-gc@sisogc-213914.iam.gserviceaccount.com` |
| Google Cloud project | `sisogc-213914` |
| Access level | Read-only (cannot create, edit, or delete events) |

The private key is embedded in `index.html`. The service account has read-only access to all configured calendars. If the key is ever exposed publicly, revoke it in Google Cloud Console (IAM → Service Accounts → Keys) and replace `PRIVATE_KEY` and `PRIVATE_KEY_ID` in `index.html`.

To add a new calendar: add an entry to the `CALENDARS` array in `index.html` and share the calendar with the service account email above.

---

## 8. GWT hash maintenance (if MyTimetable breaks)

Both `run_in_console.js` and `import_to_firebase.js` use a hardcoded GWT permutation hash in the request body (`GWT_PERMUTATION_BODY`). If Northumbria upgrades MyTimetable, this hash may change, causing the script to return `//EX[...]` (IncompatibleRemoteServiceException).

To get the new hash:

1. Open MyTimetable, open DevTools → Network tab
2. Filter by `scheduleService`
3. Navigate the calendar to trigger a request
4. Click the request → Payload tab
5. The hash is the 32-character hex string after the module base URL in the request body
6. Update `GWT_PERMUTATION_BODY` in both scripts

Full details are in `SiSo_Session_Handover_2026-04-29.md` → "The two GWT permutation hashes".

---

## 9. What is NOT yet automated

- **SiSo upload** - the CSV must be manually uploaded to SiSo's Booking Importer. SiSo has no public API.
- **Equipment bookings** - still fully manual. Each module's PEP document must be read and interpreted to generate equipment booking rows. Phase 2 of the original project (see `SiSo_Project_Memory.md`).
- **Timetable sync on a schedule** - MyTimetable requires an authenticated SSO session. There is no service account or API key available. The console script is the minimum possible friction given this constraint. If Northumbria IT ever exposes a timetabling API, this could be automated fully.

---

## Changelog

### rev. 4 (May 2026)

- **Topic nav consistency**: all 10 topic pages plus `index.html` now carry the same 10-button topic nav (Teaching, Research, Ethics, Risk Assessment, Workflows, Lab & Equipment, Inductions & Training, PEPs, Timetabling, SiSo Bookings). Previously the first seven pages only carried seven buttons, so PEPs/Timetabling/SiSo were unreachable from those pages.
- **Risk Assessment seed populated**: the `risk-assessment` topic in `DEFAULT_TOPICS` (mirrored across all 10 topic pages) now contains the SharePoint Risk Assessment Library link, RA contact, finding/creating/updating guidance, and the biennial review FAQ. Previously the seed was a stub.
- **Field-name fix for Tech setup? / Tech support? columns**: `Semester1.html`, `Semester2.html` and `import_to_firebase.js` now write the Firestore fields as `techSetup` and `techSupport`, matching what the table renderer reads. Previously the seed-write loop and the importer wrote them as `setup` and `support`, so every seeded row and every imported row showed blank Tech setup? / Tech support? cells. Bumped seed META doc to `seeded_v6` to trigger an automatic re-seed with the corrected field names. **Manual edits in those two columns from rev. 3 onwards will be wiped on next page load.** Back up Firestore first if any are worth keeping.
- **Participant Bank link fixed**: `index.html` previously linked the Participant Bank button and A-Z sidebar entry to a non-existent `participant-register.html` (and a duplicate `participant-researcher.html` link in the sidebar). Both now point to the actual `participant-matcher.html` file, which combines public participant registration with a PIN-gated researcher panel.
- **README corrections**: subsection count corrected from 7 to 6 (the "Useful Links" sidebar is a separate Firestore collection, not a topic subsection); columns table now correctly shows Tech setup? and Tech support? as present (not removed); Firestore schema updated to use the correct `techSetup` / `techSupport` field names; identical-string seeded re-seed instruction fixed; references to the non-existent `generate_topic_pages.py` build script removed and replaced with manual instructions.
- **Stale documentation removed**: header comments in `index.html` referring to the old Mon-Sun calendar layout updated to describe the current 1/3/5-day toggle. Stale `seeded_v3` comments and bare `seeded` doc references in `Semester1.html` / `Semester2.html` updated.
- **`SiSo_Project_Memory.md` refreshed**: now describes Phase 1b (`run_in_console.js`) as the working artefact, with `v2_siso_importer.py` flagged as retired. Per-semester cost figure updated to 5-10 minutes (was 15-30).

### rev. 3 (April 2026)

- Split the single-file portal into 10 dedicated topic pages (Teaching, Research, Ethics, Risk Assessment, Workflows, Lab & Equipment, Inductions & Training, PEPs, Timetabling, SiSo Bookings). Each topic has its own URL.
- Added the Firestore `topics` collection with editable, named-edit-tracked sub-sections per topic.
- Pre-populated Risk Assessment per request from Claire Thornton (SharePoint library link + RA guidance).
- A-Z links sidebar: hardcoded list now seeded once into Firestore; every link has both edit and delete buttons.
- Semester pages: stripped "As Above" + blank dates/times in seed data, replaced with explicit per-row values.
- Semester pages: normalised `/` to ` & ` in `room` and `academic` fields (PEP URLs and dates left untouched).
- Semester pages: empty modules are now greyed out in the sidebar and, when clicked, show a dedicated empty-state panel with "Add first row" and "Delete module" buttons (instead of the broken module-block render that previously collapsed to zero width when the table had no rows).
- Semester pages: deleting the last row of a module now removes the module from the sidebar and Firestore. Re-add via the existing "+ Add module" button if needed.
- Bumped seed META doc to `seeded_v5` for both semester collections so the cleanups apply automatically on next page load.
- **Pre-clear on re-seed**: `runSeedIfNeeded` now deletes every existing doc in the `semN_sessions` collection before writing the new seed. Without this, orphan docs from earlier seed versions (e.g. an empty `{code}_0` dummy row from rev. 1, written for empty modules before `_placeholder` existed) would survive the re-seed and be re-rendered as broken empty session rows under modules like SP3008 and SP4000. The pre-clear guarantees the collection matches `SEED_DATA` exactly after every version bump.

### rev. 2 (April 2026)

- Calendar widget rebuilt as a custom dark-mode 1/3/5-day view using the Google Calendar API (replaced the embedded iframe).
- Workflow map header restyled to match site-wide design; Portal back link added.
- A-Z links sidebar moved to Firestore.
- `import_to_firebase.js` now auto-detects academic year and semester start dates.

### rev. 1 (early 2026)

- Initial portal, semester pages, workflow map, and SiSo CSV automation built.
