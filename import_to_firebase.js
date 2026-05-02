// ============================================================
// import_to_firebase.js
// MyTimetable -> Firebase Firestore Direct Import
// ============================================================
//
// HOW TO USE:
//   1. Go to mytimetable.northumbria.ac.uk/schedule and log in
//   2. Open DevTools (F12) -> Console tab
//   3. Paste this entire script and press Enter
//   4. A status banner appears top-right while it runs
//   5. When it says "Done - X sessions written", reload
//      Semester1.html or Semester2.html to see the updates
//
// WHAT IT DOES:
//   - Scrapes all room bookings from MyTimetable (same engine
//     as run_in_console.js - only the output step differs)
//   - Determines which semester each session belongs to based
//     on the SEMESTER_DATES config below
//   - For each session found:
//       * If a Firestore doc already exists for that module+date+start+room
//         -> skips it (preserves any manual edits staff have made)
//       * If no doc exists
//         -> creates a new one with the timetable data
//   - NEVER deletes or overwrites existing Firestore documents
//   - Reports how many were new vs already present
//
// WHAT IT DOES NOT DO:
//   - Delete sessions that were removed from the timetable
//     (those need manual removal in the semester page)
//   - Overwrite academic, PEP, set-up, support, food fields
//     that staff have already filled in
//   - Touch any Firestore collection other than sem1_sessions
//     and sem2_sessions
//
// FIRESTORE DOCUMENT SCHEMA (matches Semester1/2.html):
//   collection: sem1_sessions  or  sem2_sessions
//   docId:      moduleCode + "_" + uid   (e.g. "SP4002_abc123")
//   fields:
//     moduleCode:  string   (e.g. "SP4002")
//     moduleName:  string   (pulled from existing Firestore docs if known)
//     moduleLead:  string   (pulled from existing Firestore docs if known)
//     techLead:    string   (pulled from existing Firestore docs if known)
//     week:        string   (teaching week number, derived from SEMESTER_DATES)
//     repeats:     "1"
//     academic:    ""       (blank - staff fills in)
//     date:        string   (dd/mm/yyyy)
//     start:       string   (HH:MM)
//     finish:      string   (HH:MM)
//     room:        string   (long-form room name)
//     pep:         ""       (blank - staff fills in)
//     techSetup:   ""       (blank - staff fills in. NOTE: must be "techSetup",
//                            not "setup" - the Semester pages render this column
//                            from the techSetup field.)
//     techSupport: ""       (blank - staff fills in. NOTE: must be "techSupport",
//                            not "support" - same reason as above.)
//     food:        ""       (blank - staff fills in)
//     _order:      number   (epoch ms of session date+start, for sort)
//     _source:     "import" (marks this as timetable-imported, not hand-entered)
//     _importedAt: string   (ISO timestamp of when this import ran)
//
// SEMESTER DATE CONFIG:
//   Adjust SEMESTER_DATES below for each academic year.
//   weekStart is the Monday of Teaching Week 1.
//   Sessions before or after the semester window go into
//   the "unknown" bucket and are reported in the console
//   but still written (to sem1 or sem2 based on which is closer).
//
// COLLISION DETECTION:
//   A session is considered a duplicate if a Firestore document
//   already exists with matching moduleCode + date + start + room.
//   This check is done against ALL existing docs loaded at the
//   start of the run (one batch read per collection).
//
// KEY CONSTANTS TO UPDATE EACH ACADEMIC YEAR:
//   STAFF_KEY              - academic year + staff ID
//   AY_PREFIX              - academic year prefix for room keys
//   GWT_PERMUTATION_BODY   - update if IncompatibleRemoteServiceException
//   SEMESTER_DATES         - week 1 Monday for each semester
//
// IF THE SCRIPT BREAKS:
//   Set DEBUG = true at the top. It will download a .txt file
//   with the raw GWT-RPC response - share this (not publicly)
//   with whoever is debugging.
// ============================================================

(function () {

  // ── CONFIG ────────────────────────────────────────────────────────────────
  var DEBUG        = false;
  var SISO_USER_ID = '145368';
  var STAFF_KEY    = 'NUN1AY2526!staff!PWWK5';  // for reference / future use

  // ── ACADEMIC YEAR AUTO-DETECTION ─────────────────────────────────────────────
  // Northumbria's academic year runs Sep–Jun. If today is August or later we are
  // in the START year of a new AY; otherwise we are in the END year of the current AY.
  //   e.g. today = Nov 2026 -> AY start = 2026, end = 2027
  //        today = Mar 2027 -> AY start = 2026, end = 2027
  //
  // AY_PREFIX format: NUN1AY[last2ofStart][last2ofEnd]
  //   e.g. 2025/26 = NUN1AY2526
  //
  // Semester dates are derived by finding the Monday on or after a fixed
  // target date each year. Northumbria's pattern (confirmed 2024-26):
  //   Sem 1 Teaching Week 1: last week of September (target: Sep 22)
  //   Sem 2 Teaching Week 1: last week of January   (target: Jan 26)
  // nextMonday(year, month, day) returns the Monday of the week containing
  // that date, or that date itself if it is already a Monday.

  function nextMonday(y, m, d) {
    // m is 0-indexed (0=Jan, 8=Sep)
    var date = new Date(y, m, d);
    var dow = date.getDay(); // 0=Sun
    if (dow === 0) date.setDate(d + 1);       // Sun -> Mon
    else if (dow !== 1) date.setDate(d + (8 - dow)); // any other day -> next Mon
    return date;
  }

  var today = new Date();
  var ayStart = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  // e.g. ayStart=2025 -> AY 2025/26
  var ayEnd   = ayStart + 1;
  var AY_PREFIX = 'NUN1AY' + String(ayStart).slice(2) + String(ayEnd).slice(2);

  // Semester 1: week 1 Monday on or after 22 Sep of ayStart
  // Semester 2: week 1 Monday on or after 26 Jan of ayEnd
  // End dates: Sem 1 ends ~23 Jan of ayEnd; Sem 2 ends ~30 Jun of ayEnd
  var SEMESTER_DATES = {
    sem1: {
      weekStart: nextMonday(ayStart, 8, 22),   // on/after 22 Sep
      end:       new Date(ayEnd, 0, 24),        // ~24 Jan
    },
    sem2: {
      weekStart: nextMonday(ayEnd, 0, 26),      // on/after 26 Jan
      end:       new Date(ayEnd, 5, 30),        // ~30 Jun
    },
  };

  console.log('SiSo import: AY ' + ayStart + '/' + ayEnd
    + ' | Sem1 starts ' + SEMESTER_DATES.sem1.weekStart.toDateString()
    + ' | Sem2 starts ' + SEMESTER_DATES.sem2.weekStart.toDateString());

  // Teaching week calculation - returns integer week number (1-based)
  // or 0 if session is before the semester start.
  function teachingWeek(sessionDate, semStart) {
    var delta = sessionDate - semStart;
    if (delta < 0) return 0;
    return Math.floor(delta / (7 * 24 * 3600 * 1000)) + 1;
  }

  // Determine which semester a date belongs to.
  // Returns 'sem1', 'sem2', or null (outside both windows).
  function getSemester(sessionDate) {
    var d = sessionDate;
    if (d >= SEMESTER_DATES.sem1.weekStart && d <= SEMESTER_DATES.sem1.end) return 'sem1';
    if (d >= SEMESTER_DATES.sem2.weekStart && d <= SEMESTER_DATES.sem2.end) return 'sem2';
    return null;
  }

  // ── FIREBASE CONFIG (same project as Semester1/2.html) ───────────────────
  var FIREBASE_CONFIG = {
    apiKey:            'AIzaSyDSK-2hI6ML1eykIed6E8S5Ve29phrEolI',
    authDomain:        'nu-school-of-sport.firebaseapp.com',
    projectId:         'nu-school-of-sport',
    storageBucket:     'nu-school-of-sport.firebasestorage.app',
    messagingSenderId: '396866213410',
    appId:             '1:396866213410:web:bc7f31d1eb1833306d1c7b'
  };

  // ── GWT-RPC CONFIG (identical to run_in_console.js) ──────────────────────
  var year = new Date().getFullYear();
  var START_DAY = 1; var START_MONTH = 1; var START_YEAR = year;
  var END_DAY = 31; var END_MONTH = 12; var END_YEAR = year;

  var GWT_PERMUTATION_BODY = 'F943320AB66B64CED93C40CE6A5B4B47';
  var hashMatch = Array.from(document.querySelectorAll('script[src]'))
    .map(function (s) { return s.src; })
    .join(' ')
    .match(/\/([A-F0-9]{32})\.cache\.js/);
  var GWT_PERMUTATION_HEADER = hashMatch ? hashMatch[1] : GWT_PERMUTATION_BODY;

  if (!window.csrfToken) {
    alert('No CSRF token found. Make sure you are fully logged in to MyTimetable.');
    return;
  }

  var MODULE_BASE  = 'https://mytimetable.northumbria.ac.uk/mytimetable/';
  var SERVICE_URL  = 'https://mytimetable.northumbria.ac.uk/mytimetable/scheduleService';

  // ── ROOMS TO FETCH (identical to run_in_console.js) ──────────────────────
  var ROOMS_TO_FETCH = [
    'NBD 406', 'NBD 423', 'NBD 425',
    'SPF 001 (M)', 'SPF 001 (N)', 'SPF 001 (S)', 'SPF 001 (ALL)',
    'SPF 102', 'SPF 109', 'SPF 110', 'SPF 111', 'SPF 112',
    'SPF 113', 'SPF 114', 'SPF 115', 'SPF 118'
  ];

  // ── ROOM NAME MAP (MyTimetable short -> long form) ────────────────────────
  var ROOM_MAP = {
    'NBD 406':       'NBD 406 (Environmental Chamber)',
    'NBD 423':       'NBD 423 (Wet Lab)',
    'NBD 425':       'NBD 425 [Lab]',
    'SPF 001 (N)':   'SPF 001 (Sport Central Main Hall North)',
    'SPF 001 (S)':   'SPF 001 (Sport Central Main Hall South)',
    'SPF 001 (M)':   'SPF 001 (Sport Central Main Hall Middle)',
    'SPF 001 (ALL)': 'SPF 001 (Sport Central Main Hall)',
    'SPF 102':       'SPF 102 (Sport Central Upper Hall)',
    'SPF 109':       'SPF 109 (Sprint Track Laboratory)',
    'SPF 110':       'SPF 110 (Integrated Performance Laboratory)',
    'SPF 111':       'SPF 111 (Performance Analysis Suite)',
    'SPF 112':       'SPF 112 (Nutrition Laboratory)',
    'SPF 113':       'SPF 113 (Physiology Laboratory)',
    'SPF 114':       'SPF 114 (Biomechanics Laboratory)',
    'SPF 115':       'SPF 115 (Gait Laboratory)',
    'SPF 118':       'SPF 118 (S&C)'
  };

  // ── STATUS BANNER ─────────────────────────────────────────────────────────
  var ind = document.createElement('div');
  ind.style.cssText = [
    'position:fixed;top:16px;right:16px;z-index:999999;',
    'background:#1f4e78;color:white;padding:12px 20px;',
    'border-radius:6px;font-family:sans-serif;font-size:13px;',
    'font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.3);',
    'max-width:320px;line-height:1.4;'
  ].join('');
  ind.textContent = 'Initialising Firebase...';
  document.body.appendChild(ind);

  function setStatus(msg, colour) {
    ind.textContent = msg;
    if (colour) ind.style.background = colour;
  }

  // ── DEBUG HELPER (identical to run_in_console.js) ─────────────────────────
  var rawResponse = null;
  var parsedTable = null;
  var parsedTokens = null;

  function downloadDebug(label, errMsg) {
    var lines = ['=== Import to Firebase Debug Dump ===',
      'Generated: ' + new Date().toISOString(),
      'Label: ' + label];
    if (errMsg) lines.push('Error: ' + errMsg);
    lines.push('', '--- Request ---', 'URL: ' + SERVICE_URL,
      'Hash (body): ' + GWT_PERMUTATION_BODY,
      'Hash (header): ' + GWT_PERMUTATION_HEADER);
    lines.push('', '--- Response (first 2000 chars) ---');
    lines.push(rawResponse ? rawResponse.slice(0, 2000) : '(none)');
    lines.push('', '--- Parsed string table (first 200) ---');
    if (parsedTable) {
      parsedTable.slice(0, 200).forEach(function (s, i) { lines.push((i+1) + ': ' + JSON.stringify(s)); });
    }
    var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'firebase_import_debug_' + Date.now() + '.txt';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ── GWT-RPC BODY BUILDERS (identical to run_in_console.js) ──────────────
  function buildGetScheduleBody() {
    return ['7','0','8', MODULE_BASE, GWT_PERMUTATION_BODY,
      'nl.eveoh.mytimetable.web.gwt.shared.rpc.ScheduleService', 'getSchedule',
      'nl.eveoh.threetengwt.LocalDateRange/1459284207',
      'java.lang.String/2004016611', 'Z',
      'nl.eveoh.threetengwt.LocalDate/883479684',
      '1','2','3','4','5','5','6','7','7','7','5','8',
      END_DAY, END_MONTH, END_YEAR, '8',
      START_DAY, START_MONTH, START_YEAR, '0','1','0','0'
    ].join('|') + '|';
  }

  function buildAddSubscriptionBody(roomKey) {
    return ['7','0','11', MODULE_BASE, GWT_PERMUTATION_BODY,
      'nl.eveoh.mytimetable.web.gwt.shared.rpc.ScheduleService', 'addSubscriptions',
      'java.util.Map', 'Z', 'java.util.HashMap/1797211028',
      'nl.eveoh.mytimetable.web.gwt.shared.gdto.TimetableDescriptorGDTO/1982993832',
      'java.util.Collections$EmptySet/3523698179', roomKey,
      'java.util.HashSet/3273092938',
      '1','2','3','4','2','5','6','7','1','8','9','-3','10','-3','11','0','1'
    ].join('|') + '|';
  }

  function buildRemoveSubscriptionBody(roomKey) {
    return ['7','0','6', MODULE_BASE, GWT_PERMUTATION_BODY,
      'nl.eveoh.mytimetable.web.gwt.shared.rpc.ScheduleService', 'removeSubscription',
      'java.lang.String/2004016611', roomKey, '1','2','3','4','1','5','6'
    ].join('|') + '|';
  }

  // ── FIREBASE LOADER ───────────────────────────────────────────────────────
  // Dynamically loads the Firebase SDK from the CDN (same version as the
  // semester pages use), then returns { db, collection, getDocs, doc, setDoc }
  function loadFirebase() {
    return new Promise(function (resolve, reject) {
      // Firebase v10 modular SDK - load app + firestore as ES modules
      // We use dynamic import() which works in modern browser consoles
      Promise.all([
        import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js')
      ]).then(function (modules) {
        var firebaseApp  = modules[0];
        var firestore    = modules[1];

        // Check if already initialised (script may be re-run in same session)
        var existingApps = firebaseApp.getApps ? firebaseApp.getApps() : [];
        var app = existingApps.find(function (a) { return a.name === 'importer'; });
        if (!app) {
          app = firebaseApp.initializeApp(FIREBASE_CONFIG, 'importer');
        }
        var db = firestore.getFirestore(app);
        resolve({
          db:         db,
          collection: firestore.collection,
          getDocs:    firestore.getDocs,
          doc:        firestore.doc,
          setDoc:     firestore.setDoc,
        });
      }).catch(reject);
    });
  }

  // ── RPC FETCH HELPER ──────────────────────────────────────────────────────
  function rpc(reqBody) {
    return fetch(SERVICE_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'text/x-gwt-rpc; charset=utf-8',
        'X-GWT-Module-Base': MODULE_BASE,
        'X-GWT-Permutation': GWT_PERMUTATION_HEADER,
        'X-CSRF-TOKEN': window.csrfToken,
        'locale': 'en_GB'
      },
      body: reqBody
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  // ── SUBSCRIBE / UNSUBSCRIBE ───────────────────────────────────────────────
  var subscribedRooms = [];

  function subscribeAll() {
    setStatus('Subscribing to ' + ROOMS_TO_FETCH.length + ' rooms...');
    var p = Promise.resolve();
    ROOMS_TO_FETCH.forEach(function (room) {
      var key = AY_PREFIX + '!room!' + room;
      p = p.then(function () {
        return rpc(buildAddSubscriptionBody(key)).then(function (text) {
          if (text.indexOf('//OK') === 0) {
            subscribedRooms.push(key);
          } else {
            console.warn('Subscribe failed for ' + room + ':', text.slice(0, 100));
          }
        }).catch(function (e) {
          console.warn('Subscribe error for ' + room + ':', e.message);
        });
      });
    });
    return p;
  }

  function unsubscribeAll() {
    if (!subscribedRooms.length) return Promise.resolve();
    var p = Promise.resolve();
    subscribedRooms.forEach(function (key) {
      p = p.then(function () {
        return rpc(buildRemoveSubscriptionBody(key)).catch(function (e) {
          console.warn('Unsubscribe error for ' + key + ':', e.message);
        });
      });
    });
    return p;
  }

  // ── PARSE GWT-RPC RESPONSE (identical logic to run_in_console.js) ─────────
  // Returns array of { date (Date obj), dateStr (dd/mm/yyyy), start, finish, room, mod }
  function parseResponse(text) {
    if (!text.startsWith('//OK[')) {
      throw new Error('Unexpected response: ' + text.slice(0, 80));
    }

    var strTableStart = -1;
    for (var i = text.length - 1; i >= 0; i--) {
      if (text[i] === '[' && text[i-1] === ',' && text[i+1] === '"') {
        strTableStart = i; break;
      }
    }
    if (strTableStart === -1) throw new Error('Could not find string table in response.');

    var strTableEnd = text.indexOf(']', strTableStart);
    var strTable = JSON.parse(text.slice(strTableStart, strTableEnd + 1));
    var tokens = text.slice(5, strTableStart - 1).split(',');
    parsedTable = strTable;
    parsedTokens = tokens;

    function str(token) {
      var n = parseInt(token, 10);
      if (n > 0 && n <= strTable.length) return strTable[n - 1];
      return null;
    }

    function secsToTime(secs) {
      secs = parseInt(secs, 10);
      var h = Math.floor(secs / 3600);
      var m = Math.floor((secs % 3600) / 60);
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    function fmtDate(y, mo, d) {
      return (d < 10 ? '0' : '') + d + '/' + (mo < 10 ? '0' : '') + mo + '/' + y;
    }

    var ldIdx = 0; var ltIdx = 0;
    strTable.forEach(function (s, i) {
      if (s === 'nl.eveoh.threetengwt.LocalDate/883479684') ldIdx = i + 1;
      if (s === 'nl.eveoh.threetengwt.LocalTime/2768521278') ltIdx = i + 1;
    });

    var rooms = {}; var mods = {};
    strTable.forEach(function (s) {
      if (/^(SPF|NBD) \d{2,3}$/.test(s)) { rooms[s] = true; return; }
      var m = s.match(/^(SPF|NBD) \d{2,3} \(([^)]+)\)$/);
      if (m && !/\s/.test(m[2])) rooms[s] = true;
      if (/^[A-Z]{2}\d{4}$/.test(s)) mods[s] = true;
    });

    var bookings = []; var seen = {};

    for (var i = 3; i < tokens.length; i++) {
      if (parseInt(tokens[i], 10) !== ldIdx) continue;
      var y = parseInt(tokens[i-3], 10);
      var mo = parseInt(tokens[i-2], 10);
      var d = parseInt(tokens[i-1], 10);
      if (y < 2024 || y > 2030 || mo < 1 || mo > 12 || d < 1 || d > 31) continue;

      var wStart = Math.max(0, i - 30);
      var wEnd   = Math.min(tokens.length - 1, i + 100);

      var times = [];
      for (var j = wStart + 3; j <= wEnd; j++) {
        if (parseInt(tokens[j], 10) === ltIdx) {
          var secs = parseInt(tokens[j-3], 10);
          var mins = parseInt(tokens[j-2], 10);
          var hours = parseInt(tokens[j-1], 10);
          if (hours >= 0 && hours < 24 && mins >= 0 && mins < 60) {
            var totalSecs = hours * 3600 + mins * 60 + (secs >= 0 && secs < 60 ? secs : 0);
            times.push(totalSecs);
          }
        }
      }
      if (times.length === 0) continue;

      var foundRooms = [];
      for (var j = wStart; j <= wEnd; j++) {
        var sv = str(tokens[j]);
        if (sv && rooms[sv] && foundRooms.indexOf(sv) === -1) foundRooms.push(sv);
      }
      if (foundRooms.length === 0) continue;

      var foundMod = '';
      for (var j = wStart; j <= wEnd; j++) {
        var sv = str(tokens[j]);
        if (sv && mods[sv]) { foundMod = sv; break; }
      }
      if (!foundMod) continue;

      times.sort(function (a, b) { return a - b; });
      var startSecs = times[0];
      var endSecs   = times[times.length - 1];
      if (startSecs === endSecs) endSecs = startSecs + 3600;

      foundRooms.forEach(function (room) {
        var key = y + '-' + mo + '-' + d + '|' + startSecs + '|' + endSecs + '|' + room + '|' + foundMod;
        if (seen[key]) return;
        seen[key] = true;
        // Convert room short name to long name (SiSo format)
        var longRoom = ROOM_MAP[room] || room;
        bookings.push({
          dateObj:  new Date(y, mo - 1, d),
          dateStr:  fmtDate(y, mo, d),
          start:    secsToTime(startSecs),
          finish:   secsToTime(endSecs),
          room:     longRoom,
          mod:      foundMod
        });
      });
    }

    if (bookings.length === 0) throw new Error('No bookings found. Timetable may be empty or format changed.');
    return bookings;
  }

  // ── LOAD EXISTING FIRESTORE DOCS (for collision detection) ────────────────
  // Reads all existing docs from both semester collections and builds a Set
  // of "fingerprint" strings: moduleCode + "|" + date + "|" + start + "|" + room
  // A new session matches an existing one if its fingerprint is already in the Set.
  function loadExistingFingerprints(fb) {
    setStatus('Checking existing Firestore data...');
    var fingerprints = { sem1: new Set(), sem2: new Set() };
    // Also load module metadata (name, lead, techLead) keyed by moduleCode
    var moduleMeta = {};

    return Promise.all([
      fb.getDocs(fb.collection(fb.db, 'sem1_sessions')),
      fb.getDocs(fb.collection(fb.db, 'sem2_sessions'))
    ]).then(function (snaps) {
      ['sem1', 'sem2'].forEach(function (sem, idx) {
        snaps[idx].forEach(function (d) {
          var data = d.data();
          // Build fingerprint for collision check
          if (data.moduleCode && data.date && data.start && data.room) {
            fingerprints[sem].add(data.moduleCode + '|' + data.date + '|' + data.start + '|' + data.room);
          }
          // Capture module metadata if not already seen
          if (data.moduleCode && !moduleMeta[data.moduleCode]) {
            moduleMeta[data.moduleCode] = {
              moduleName: data.moduleName || '',
              moduleLead: data.moduleLead || '',
              techLead:   data.techLead   || '',
            };
          }
        });
      });
      return { fingerprints: fingerprints, moduleMeta: moduleMeta };
    });
  }

  // ── WRITE TO FIRESTORE ────────────────────────────────────────────────────
  // Writes new sessions in batches of 490 (Firestore limit is 500 per batch).
  // Only writes sessions whose fingerprint is NOT already in Firestore.
  // Returns { written, skipped, outsideSemester }
  function writeToFirestore(fb, bookings, fingerprints, moduleMeta, importedAt) {
    var toWrite  = { sem1: [], sem2: [] };
    var skipped  = 0;
    var outside  = 0;

    bookings.forEach(function (b) {
      var sem = getSemester(b.dateObj);
      if (!sem) {
        outside++;
        console.log('Outside semester window:', b.dateStr, b.mod, b.room);
        return;
      }

      var fp = b.mod + '|' + b.dateStr + '|' + b.start + '|' + b.room;
      if (fingerprints[sem].has(fp)) {
        skipped++;
        return;
      }

      // Teaching week
      var wk = teachingWeek(b.dateObj, SEMESTER_DATES[sem].weekStart);

      // Module metadata - use existing Firestore meta if known
      var meta = moduleMeta[b.mod] || { moduleName: b.mod, moduleLead: '', techLead: '' };

      // Unique doc ID: moduleCode + "_" + base36 timestamp + random
      var docId = b.mod + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

      toWrite[sem].push({
        docId: docId,
        data: {
          moduleCode:  b.mod,
          moduleName:  meta.moduleName || b.mod,
          moduleLead:  meta.moduleLead || '',
          techLead:    meta.techLead   || '',
          week:        wk > 0 ? String(wk) : '',
          repeats:     '1',
          academic:    '',
          date:        b.dateStr,
          start:       b.start,
          finish:      b.finish,
          room:        b.room,
          pep:         '',
          // AI/LLM NOTE: must be techSetup / techSupport (not setup / support).
          // The Semester1/2.html table renderer reads techSetup / techSupport.
          // Writing setup / support here causes the rendered Tech setup? /
          // Tech support? columns to show blank for every imported row.
          techSetup:   '',
          techSupport: '',
          food:        '',
          _order:      b.dateObj.getTime(),
          _source:     'import',
          _importedAt: importedAt,
        }
      });

      // Add to fingerprint set so duplicate rows within the same import are also caught
      fingerprints[sem].add(fp);
    });

    var totalToWrite = toWrite.sem1.length + toWrite.sem2.length;
    if (totalToWrite === 0) {
      return Promise.resolve({ written: 0, skipped: skipped, outside: outside });
    }

    setStatus('Writing ' + totalToWrite + ' new sessions to Firestore...');

    // Write both collections
    var CHUNK = 490;
    function writeChunked(rows, collectionName) {
      var p = Promise.resolve();
      for (var i = 0; i < rows.length; i += CHUNK) {
        (function (chunk) {
          p = p.then(function () {
            // Firestore v10 modular doesn't expose writeBatch directly on the
            // fb object we built - use individual setDoc calls for simplicity.
            // For <500 rows this is fast enough; a batch wrapper can be added
            // later if rate limits become an issue.
            return Promise.all(chunk.map(function (row) {
              return fb.setDoc(fb.doc(fb.db, collectionName, row.docId), row.data);
            }));
          });
        })(rows.slice(i, i + CHUNK));
      }
      return p;
    }

    return writeChunked(toWrite.sem1, 'sem1_sessions')
      .then(function () { return writeChunked(toWrite.sem2, 'sem2_sessions'); })
      .then(function () {
        return { written: totalToWrite, skipped: skipped, outside: outside };
      });
  }

  // ── MAIN FLOW ─────────────────────────────────────────────────────────────
  var fb;
  var importedAt = new Date().toISOString();
  var unmapped = {};

  // Step 1: Load Firebase SDK
  loadFirebase()
    .then(function (firebaseObj) {
      fb = firebaseObj;
      setStatus('Subscribing to ' + ROOMS_TO_FETCH.length + ' rooms...');
      return subscribeAll();
    })

    // Step 2: Fetch timetable
    .then(function () {
      setStatus('Fetching timetable data...');
      return rpc(buildGetScheduleBody());
    })

    // Step 3: Parse
    .then(function (text) {
      rawResponse = text;
      setStatus('Parsing response...');
      return parseResponse(text);
    })

    // Step 4: Load existing Firestore data for collision detection
    .then(function (bookings) {
      setStatus('Loading existing sessions from Firestore...');
      return loadExistingFingerprints(fb).then(function (existing) {
        return { bookings: bookings, existing: existing };
      });
    })

    // Step 5: Write new sessions
    .then(function (state) {
      return writeToFirestore(
        fb,
        state.bookings,
        state.existing.fingerprints,
        state.existing.moduleMeta,
        importedAt
      );
    })

    // Step 6: Report
    .then(function (result) {
      var msg = [
        'Done!',
        result.written + ' new session' + (result.written !== 1 ? 's' : '') + ' added',
        result.skipped + ' already existed (skipped)',
        result.outside > 0 ? result.outside + ' outside semester window' : ''
      ].filter(Boolean).join('\n');

      setStatus(msg, '#1e6b3c');
      console.log('Firebase import complete:', result);
      console.log('Reload Semester1.html or Semester2.html to see the updates.');

      if (DEBUG) downloadDebug('success', null);
      setTimeout(function () { if (ind.parentNode) ind.parentNode.removeChild(ind); }, 8000);
    })

    .catch(function (err) {
      setStatus('Error: ' + err.message, '#c0392b');
      console.error('Firebase import error:', err);
      try { downloadDebug('error', err.message); } catch (e) { console.error('Debug dump failed:', e); }
      setTimeout(function () { if (ind.parentNode) ind.parentNode.removeChild(ind); }, 10000);
    })

    // Step 7: Always clean up subscriptions
    .finally(function () {
      return unsubscribeAll().then(function () {
        console.log('Import: cleaned up ' + subscribedRooms.length + ' room subscriptions');
      });
    });

})();
