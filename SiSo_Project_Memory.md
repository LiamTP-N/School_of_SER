# SiSo Booking Automation - Project Memory

**Owner**: Liam Pearson-Noseworthy
**Role**: Senior Laboratory Technician, Department of Sport, Exercise and Rehabilitation, Northumbria University
**SiSo user ID**: 145368
**Last updated**: 2 May 2026
**Status**: Phase 1b built and working end-to-end (browser-console scrape -> SiSo CSV); Phase 2 parked (equipment bookings)

---

## Purpose of this document

This is a project memory document. It captures the full context of the SiSo booking automation project so that any future contributor (a new technician, a future Claude/LLM session, a project supervisor, a CS student picking it up as a capstone) can come in cold and understand:

1. What the underlying operational problem is
2. What solutions have been built so far
3. What solutions have been considered and ruled out, and why
4. What options remain open
5. What the institutional and personal constraints are
6. What the next sensible step would be

This document is the source of truth. If anything in the codebase or in conversation contradicts it, update this document.

---

## 1. The operational problem

### 1.1 What the team does

The Sport, Exercise and Rehabilitation (SER) technical team manages bookings for laboratory rooms and equipment in the Sport Central building (rooms SPF 109, 110, 112, 113, 114, 115, plus sub-hall variants of SPF 001). Bookings are made into an internal system called **SiSo**.

Two parallel workflows feed into SiSo each semester:

- **Room bookings**: derived from the timetabled sessions in Northumbria's MyTimetable system
- **Equipment bookings**: derived from each module's Practical Exercise Protocol (PEP) - a Word document maintained by the module lead

Both workflows are entirely manual today. Both have known failure modes. Both consume substantial technician time.

### 1.2 Current process - rooms

1. Wait for Timetabling Office to publish the semester's bookings to MyTimetable
2. Log in to mytimetable.northumbria.ac.uk/schedule (Microsoft SSO with MFA)
3. Select the relevant rooms and date range
4. Download the schedule as CSV
5. Manually reshape the CSV in Excel: explode multi-room rows, reformat dates from `YYYY-MM-DD` to `dd/mm/yyyy`, add SiSo-required columns (Quantity, BookedTo, Notes, Courses, Reference)
6. Validate every room name matches an asset in `Labs.csv`
7. Save in SiSo's expected CSV format
8. Upload to SiSo's Booking Importer (manual; institutional constraint)
9. Resolve any errors SiSo throws back
10. Spot-check that bookings landed correctly

**Estimated active time per semester**: 3-4 hours. **Per year**: 6-8 hours.

### 1.3 Current process - equipment

1. Identify which PEPs are active this semester by cross-referencing module codes against the timetable
2. Open each active PEP (.docx) from `C:\Users\pwwk5\Northumbria University - Production Azure AD\PEP` (a Teams-synced folder)
3. Read the equipment section (location varies by template version)
4. Interpret what's actually being requested: equipment, quantities (often inferred from group sizes mentioned elsewhere in the document), specific assets that map to the SiSo catalogue, substitutions for disposed/broken items
5. Cross-reference with timetabled sessions to know how many sessions need each piece of kit
6. Manually build CSV rows for SiSo (one row per asset per session)
7. Validate barcodes against SiSo's catalogue
8. Upload to SiSo, resolve errors
9. Spot-check
10. Handle ongoing changes as lecturers update PEPs mid-semester

**Estimated active time per semester**: 8-15 hours. **Per year**: 16-30 hours.

### 1.4 Combined annual cost and failure modes

**Total annual technician time on bookings**: ~22-38 hours (3-5 working days).

**Known failure modes**:

- Timetable changes after the work is done -> rework
- Lecturer adds equipment to a PEP after booking -> silent until the practical
- PEP says "1 cortex gas analyser" but the class is in 6 groups -> kit shortage
- Asset has been moved/disposed but `Labs.csv` is stale -> SiSo rejects
- Sub-hall variants of SPF 001 not in `Labs.csv` -> previously skipped (now passed through with a warning, see Phase 1)
- Two practicals booked into the same room -> negotiation with timetabling
- Liam absent -> bookings don't happen, practicals arrive with no kit (this is a real institutional risk)

---

## 2. The three-step workflow we're solving

The full workflow has three logical steps. **Step 3 must remain manual** per institutional policy.

| Step | Description | Automation status |
|---|---|---|
| 1 | Get timetable data out of MyTimetable | **Built** (Phase 1b - browser console script subscribes, fetches via GWT-RPC, unsubscribes; no manual CSV download) |
| 2 | Reshape into SiSo Booking Importer format | **Built** (same script - parses GWT-RPC response and emits a SiSo-ready CSV) |
| 3 | Upload to SiSo | **Must stay manual** (institutional constraint) |

A parallel three-step workflow exists for equipment:

| Step | Description | Automation status |
|---|---|---|
| 1 | Identify active PEPs and read their equipment sections | **Open** (see Phase 2 - parked) |
| 2 | Map equipment to SiSo asset barcodes, generate per-session bookings | **Open** (depends on step 1) |
| 3 | Upload to SiSo | **Must stay manual** |

---

## 3. What has been built (Phase 1b)

### 3.1 The script

**File**: `run_in_console.js`
**Status**: Functional, tested end-to-end against real data on multiple machines (work PC + home PC), Apr-May 2026
**Location**: Project repo, alongside the staff portal HTML files

This is the current working Phase 1 artefact. It supersedes the earlier `v2_siso_importer.py`, which required a manual MyTimetable CSV download as input. The console script removes that step entirely: it runs in the browser on the MyTimetable schedule page, scrapes the timetable directly via the GWT-RPC `getSchedule` endpoint, and produces the SiSo-ready CSV without any intermediate file. Full technical detail of the GWT-RPC handshake, the two-permutation-hash gotcha, and the parser is in `SiSo_Session_Handover_2026-04-29.md`.

**Workflow:**
1. User opens https://mytimetable.northumbria.ac.uk/schedule and logs in (Microsoft SSO + MFA)
2. User opens DevTools (F12) -> Console tab
3. User pastes the entire contents of `run_in_console.js`, presses Enter
4. Status banner top-right cycles through: Subscribing -> Fetching -> Parsing -> Downloaded N rows
5. CSV file `siso_import_YYYY-MM-DD.csv` downloads automatically
6. User spot-checks in Excel, then uploads to SiSo's Booking Importer (manual; institutional constraint)

**Output**: ~1,300-1,400 bookings for the calendar year in correct SiSo format.

### 3.2 The earlier Python artefact (retired)

**File**: `v2_siso_importer.py`
**Status**: Retired; superseded by `run_in_console.js`. Kept in archive for reference and as a fallback if the GWT-RPC interface ever breaks irrecoverably.

Took a Northumbria MyTimetable CSV and produced a SiSo Booking Importer file in two formats:
- **XLSX**: matched the supplied SiSo template, used native Excel time/date types
- **CSV**: string-formatted as SiSo expected; this was the file actually uploaded

The Python script is no longer the recommended path because it required a manual CSV-download-and-reshape step before it could run, which `run_in_console.js` eliminates.

### 3.3 Mapping rules implemented

| SiSo field | Source / rule |
|---|---|
| Quantity | Always `1` |
| Start | Timetable start time (HH:MM) |
| End | Timetable end time (HH:MM) |
| Date | Reformatted to `dd/mm/yyyy` |
| EndDate | Same as Date (every booking is single-day) |
| Asset | Long-form room name from `ROOM_MAP` (e.g. `SPF 109 (Sprint Track Laboratory)`) |
| Notes | Module code |
| BookedTo | Always `145368` (Liam's SiSo user ID) |
| Courses | Module code |
| Reference | Always blank |

### 3.4 Behaviours and edge cases handled

- **Multi-room subscriptions**: the script subscribes to all 16 SPF/NBD rooms in `ROOMS_TO_FETCH` before fetching, so that whatever the user had previously subscribed to in MyTimetable does not constrain the export. After the fetch it unsubscribes from any rooms it added, leaving the user's view exactly as it was.
- **Room-name mapping**: MyTimetable's short forms (`SPF 102`, `SPF 001 (M)`) are mapped to SiSo's expected long-form Asset field via `ROOM_MAP`. Unmapped rooms are passed through with a console warning so they are visible to the operator.
- **Sub-hall variants of SPF 001**: `(M)`, `(N)`, `(S)`, `(ALL)` are explicitly mapped.
- **Module-code regex**: broad enough to catch any 2-letter + 4-digit code (AF, BM, HA, KE, NS, AD, EL, KA, HI, AA, AP, KD, etc.) because the SER team books rooms for any department using SER spaces.
- **Date validity**: parser reads year/month/day positionally from the GWT-RPC LocalDate type marker (year range 2024-2030 sanity-check) instead of relying on a fuzzy window.
- **Subscription cleanup**: runs in a `finally` block, so a parse failure never leaves the user with extra subscriptions.
- **Debug mode**: `DEBUG = true` triggers an additional `.txt` dump containing the raw GWT-RPC response, parsed string table, and a token sample - the raw evidence needed to diagnose without re-instrumenting.

### 3.5 Per-semester time after Phase 1b

If used as designed, Phase 1b reduces room-booking time from ~3-4 hours per semester to ~5-10 minutes (run script, spot-check, upload). The previous Python-based path had reduced it to 15-30 minutes per semester; the console script trims that further by removing the manual CSV-download step.

---

## 4. What has been parked (Phase 2 - equipment bookings)

### 4.1 Why it's harder than Phase 1

Phase 1 is deterministic CSV-to-CSV transformation. Phase 2 requires:

- Reading **hundreds of `.docx` files** in inconsistent formats
- Across at least **four template generations** (2018, 2020, current, plus a netball variant)
- With equipment sections that **move location** between versions
- Containing **ambiguous quantities** ("six", "1 or 2", "ideally two, at least one", "Quantity: 1" with "students work in groups of 5-6" elsewhere)
- Using **equipment names that don't match** the SiSo catalogue ("Cortex gas analyser" vs catalogue's "Gas analysers - Servomex")
- Against a **noisy SiSo catalogue** (320 rows including disposed/broken items, duplicates, inconsistent naming)

### 4.2 The catalogue problem

`Equipment.csv` from SiSo contains 320 rows. Issues:

- ~74 rows bundle multiple physical items under one asset name with multiple barcodes (e.g. "Actigraph" has 15 barcodes)
- Status info embedded in name field rather than a status column ("DISPOSED", "FAULTY", "Broke")
- Duplicate entries with no clear deduplication ("Skinfold Caliper" appears twice; "HP EliteBook 850" appears twice)
- `Category` column is near-useless ("DSER, Sports Central" applies to 211 rows)
- No reliable way to filter "bookable for teaching" without manual curation

### 4.3 Options considered for Phase 2

| Option | Verdict | Reason |
|---|---|---|
| Rule-based parser only | Rejected | ~60% accuracy on messy PEPs, silent failure mode (kit doesn't turn up) |
| LLM-assisted extraction via Claude API | Blocked | Liam unwilling to pay personal API costs; institutional billing not pursued; work machine has corporate SSL inspection (`CRYPT_E_NO_REVOCATION_CHECK` on test) |
| LLM-assisted extraction via Claude.ai paste workflow | Open but rejected by Liam as "manual dressed up as automation" |
| Local offline LLM (e.g. Ollama with Llama 3.1 8B) | Considered then dropped | Work laptop hardware unknown; likely no GPU; 7-8B models have noticeably lower quality on messy extraction; install permissions uncertain |
| Standardised PEP template with stricter Section 3 | Rejected as primary route | Word templates can't enforce data validation; lecturers will type "six" instead of "6"; social enforcement has already failed for years |
| Companion Excel "booking sheet" filled by lecturers | Possible | Requires change management Liam may not have authority to mandate |
| Companion Excel filled by Liam himself | Rejected | Liam wants automation, not faster manual entry |
| Google Forms | Rejected | Forms can't do tables; equipment booking is inherently tabular (multiple items per session) |
| Google AppSheet | Possible | Unknown if Liam's Northumbria Google tenancy includes it; would need to check |
| CS department final-year project | Open | Pitch drafted (see Section 6) |

### 4.4 Why Phase 2 is parked

Every realistic technical path requires a trade-off Liam hasn't been able to commit to:

- Paying for API access (no)
- Installing software outside work IT policy (likely blocked)
- Accepting manual paste steps in the workflow (rejected as "not really automation")
- Mandating new PEP templates or companion sheets (no clear authority)
- Buying/borrowing GPU-capable hardware for local LLM (out of scope)

Better to park cleanly than to half-build something that won't be used. Phase 2 should be revisited when one of these constraints changes.

---

## 5. Constraints (the hard limits)

### 5.1 Institutional / IT

- **No MyTimetable API access** (refused by IT in earlier conversation; not yet re-litigated with new framing - see Section 6)
- **MyTimetable uses GWT-RPC** (`Content-Type: text/x-gwt-rpc`), making third-party API client development disproportionate
- **No Playwright/Selenium** likely permitted on work machine (MDM policy)
- **Corporate SSL inspection** on outbound HTTPS (cert revocation check failures)
- **SiSo upload step must remain manual** (institutional policy)

### 5.2 Personal / financial

- **No personal payment for API access**
- **No personal subscription to dev tools** beyond what's already held (Claude.ai)
- **Limited time**: Liam has competing demands (UCD Lecturer application, CASES accreditation, NTFS narrative, dissertation supervision, peer review activity, family business IT support)

### 5.3 Hardware

- Work laptop: standard university issue. Hardware spec not yet confirmed but unlikely to have discrete GPU
- Personal hardware status not confirmed for offline LLM purposes

### 5.4 Data and people

- **Hundreds of PEPs** in the Teams folder, mostly archived rather than active
- **PEP filenames are "kind of, but not really" structured** - need to inspect content to determine which are current
- **Lecturers cannot reliably be required to do new admin** without HoD support
- **Single point of failure**: Liam is the only person with the institutional knowledge to do the current process

---

## 6. Open questions and the consultation strategy

Three institutional conversations have been drafted but **not yet sent**. Liam has not yet built anything (this document was drafted at the point where Liam asked for "from scratch" pitches, with the script not yet built per these instructions).

### 6.1 Three pitches drafted

**Pitch 1 - Timetabling Office**
Asks three closed questions:
1. Is MyTimetable's REST API enabled at Northumbria?
2. Is anyone else pulling MyTimetable data programmatically?
3. Is there an existing or planned MyTimetable-SiSo integration at institutional level?

Most likely to unlock the whole project if answer to (1) or (3) is yes.

**Pitch 2 - IT**
Asks for a 15-minute conversation. Presents four ranked options:
1. Official MyTimetable API access
2. Sanctioned automation route (server-hosted job with stored credentials)
3. Locally-installed automation tool (expects this to be declined; wants it on record)
4. Formal acknowledgement that the manual workflow is the institutional standard

Option 4 is deliberate political cover. Reframes the conversation from "yes/no on a request" to "which of four outcomes do we settle on".

**Pitch 3 - Computer Science department**
Pitches the problem as a final-year/MSc capstone project. Offers anonymised data, problem brief, real-world testing environment, and credit on any resulting publication. Asks whether it fits their project catalogue.

### 6.2 Two further audiences identified

**Pitch A - Module leads**: change-management framing. Presents the trade-offs honestly and asks whether they'd be willing to fill in a structured equipment sheet. Should only be sent if HoD backs the route.

**Pitch B - HoD / line management**: institutional risk and continuity framing. Names the single-point-of-failure issue. Ties the project to CASES, NTFS, and Liam's professional development. Asks for "weight in conversations with IT/Timetabling".

### 6.3 Recommended sequence

1. **HoD first** (Pitch B). Get managerial steer on which routes are politically viable. May open doors with IT directly.
2. **Timetabling** (Pitch 1). Closed questions, low political cost.
3. **IT** (Pitch 2), with whatever leverage HoD provides.
4. **CS department** (Pitch 3) only if 1-3 don't unblock the problem.
5. **Module leads** (Pitch A) only if HoD has backed the route that requires their cooperation.

### 6.4 The honest meta-question

Liam should decide privately, before sending anything: is the realistic time saving (20-30 hours/year) worth the implementation cost (a year of intermittent work plus ongoing maintenance plus the political capital of multiple departmental conversations)?

If on reflection the manual process is fine and the energy is better spent on UCD/CASES/NTFS - that is a legitimate outcome. This document still has value as institutional handover material.

---

## 7. The ideal future state (if everything resolves)

### 7.1 Workflow A - automated room bookings

1. Pull timetable data via the browser-console GWT-RPC scrape (`run_in_console.js`, Phase 1b - already built; eliminates the previous manual CSV download step)
2. Local script transforms it (same script - already built)
3. Upload to SiSo (manual, unavoidable per institutional policy)
4. Email notification of any warnings (not yet built; trivial addition if needed)

**Per-semester time**: 5-10 minutes. Already in production.

### 7.2 Workflow B - automated equipment bookings

1. Script identifies active PEPs by cross-referencing the timetable
2. LLM extracts equipment from each PEP
3. LLM matches to SiSo catalogue with confidence scoring
4. Cross-reference with timetable for per-session bookings
5. Generate review sheet highlighting low-confidence matches
6. Human review (30-60 minutes per semester)
7. Upload approved CSV to SiSo
8. Watch-folder triggers for mid-semester PEP updates

**Per-semester time**: 1-2 hours.

### 7.3 Combined ideal-future-state cost

Phase 1b is already in production and costs ~5-10 minutes per semester (~10-20 minutes per year). If Phase 2 is ever built out as in 7.2 above, total combined time would be ~1-2 hours per semester (~2-4 hours per year), saving ~25-35 hours per year vs the current fully-manual equipment workflow plus the now-superseded manual room workflow.

---

## 8. Implementation timeline (if pursued)

| Period | Activity |
|---|---|
| Month 1 | Discovery and consultation (the five pitches in Section 6) |
| Month 2-3 | Build/refine room booking automation (Phase 1) |
| Month 4-6 | Address LLM access constraint; build equipment extraction proof-of-concept |
| Month 7-9 | Equipment booking pilot, run alongside manual process for one semester |
| Month 10-12 | Full deployment of equipment workflow, manual process drops to spot-checking |
| Year 2+ | Maintenance (~1-2 hours/month), annual review |

---

## 9. Files associated with this project

| File | Purpose |
|---|---|
| `run_in_console.js` | Phase 1b script (current, working). Browser-console GWT-RPC scrape -> SiSo CSV |
| `v2_siso_importer.py` | Earlier Phase 1 script (retired). CSV-in, CSV-out Python; kept for reference and as fallback |
| `Northumbria_Timetables_download_like_this.csv` | Example MyTimetable export, used for testing the retired Python script |
| `Labs.csv` | Reference list of room-type assets, 60 rows; "Barcodes" column actually holds room name strings for room-type assets |
| `Equipment.csv` | Full SiSo asset catalogue, 320 rows, includes equipment as well as rooms; messy (see Section 4.2) |
| `SiSo_Booking_Importer_TEMPLATE.xlsx` | SiSo's reference template for the booking importer |
| `Blank_PEP_-_SER_v1.docx` | Current blank PEP template (March 2026) |
| Various PEP examples (`PEP_-_SP7011*.docx` etc.) | Real PEPs showing the format variation across template generations |
| `SiSo_importer_prompt.md` | Original problem brief Liam wrote |
| `SiSo_Session_Handover_2026-04-29.md` | Detailed technical notes from the build session that produced `run_in_console.js`. To be retired once this Project Memory is fully up to date (which it now is, as of May 2026 update). |
| `THIS DOCUMENT` | Project memory |

---

## 10. Useful technical context for future contributors

### 10.1 MyTimetable internals (discovered through DevTools inspection)

- Built on **GWT (Google Web Toolkit)** - confirmed by `X-GWT-Permutation` header and `text/x-gwt-rpc` content type
- Endpoint: `https://mytimetable.northumbria.ac.uk/mytimetable/scheduleService` (POST)
- Authentication: cookie-based (`JSESSIONID`) plus `X-CSRF-TOKEN` header
- Vendor: Semestry/Eveoh
- The GWT permutation hash is tied to a specific compiled JS bundle; any vendor update breaks hard-coded clients
- A fully-functional REST API exists in the Semestry product - the question is whether Northumbria has it enabled

### 10.2 SiSo Booking Importer internals

- Documentation references API support for MyTimetable specifically ("API support for Timetabling including CelCat and MyTimetable")
- Suggests an institutional integration may be possible at the SiSo end without involving Northumbria's IT
- Worth a five-minute email to the SiSo contact before any build work
- Importer accepts both rooms and equipment (uses the same `Asset` field for either, populated with the asset's barcode/name string)
- Upload step: documented as institutional-policy manual

### 10.3 PEP document structure (across template versions)

- 2018 format (e.g. HL_PEP_592): "Section 3 - Logistics", often no equipment table
- 2020 format (e.g. HL_PEP_4717): "Section 3 - Logistics & Equipment List" with structured table
- Current format (2025-2026): "Section 3 - Equipment", structured table with Quantity / Equipment / Stored in / Picture columns
- Netball variant (SP5039): different again
- All formats: equipment is in a Word table that must be extracted, not free text

### 10.4 Where PEPs live

`C:\Users\pwwk5\Northumbria University - Production Azure AD\PEP` - flat folder, hundreds of files, Teams-synced, auto-updates when lecturers edit. Filename conventions are inconsistent.

---

## 11. What a future contributor should do first

If you're picking this project up cold, start here:

1. **Read this document end-to-end** (you're doing it now)
2. **Read `SiSo_importer_prompt.md`** for the original problem framing
3. **Open `run_in_console.js`** - the header comment block is comprehensive. Pay particular attention to the GWT-RPC body shape and the room-name `ROOM_MAP`.
4. **Read `SiSo_Session_Handover_2026-04-29.md`** for the full debug-and-build trail behind `run_in_console.js`, including the two-permutation-hash gotcha that broke earlier versions.
5. **Confirm Phase 1b still works** by running `run_in_console.js` against MyTimetable (any logged-in browser). Spot-check a few rows of the resulting CSV against MyTimetable's UI.
6. **Check whether anything in the constraints (Section 5) has changed** - new role for Liam, different IT policy, new Anthropic billing options, hardware refresh, etc. Constraint changes are what unlock new options.
7. **Decide whether Phase 2 is worth pursuing now**, given current constraints
8. **If yes, revisit the consultation strategy in Section 6** - has anything been sent? Has anyone responded?

---

## 12. Document maintenance

Update this document whenever:

- A new constraint is discovered or removed
- A new option is considered or rejected
- A pitch is sent and a response received
- A piece of code is built, modified, or retired
- The estimated time costs prove materially wrong in either direction
- The project changes scope

The point of this document is that nobody (including future-Liam, future-Claude, or a CS student) should have to reconstruct this thinking from scratch. Keep it current.

---

## 13. Revision log

- **24 April 2026** - Initial document. Phase 1 = `v2_siso_importer.py`. Phase 1b not yet built.
- **29 April 2026** - `SiSo_Session_Handover_2026-04-29.md` produced; Phase 1b (`run_in_console.js`) built and tested end-to-end.
- **2 May 2026** - This document refreshed: Phase 1b incorporated into Sections 2, 3, 7, 9, 11. The earlier `v2_siso_importer.py` is now described as retired (kept for fallback only). The handover document is now redundant for status purposes and may be retired or kept purely as a build-debug archive.
