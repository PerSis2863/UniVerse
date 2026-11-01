# Browser and API checks

The scripts used to test each Stage 5 item on the built site (see `STAGE-5-PLAN.md`, the Progress
rows, for what each one showed). They sign in as the demo and test accounts with mock tokens (only
possible with demo sign-in on, i.e. locally) and use the sample data from migration 0002 (course
`cmulde0g900147d341qn9mxlw` "CS101", teacher demo@teacher.com, co-teacher tara@teacher.com, TA
tom@teacher.com, students alice@student.com, bob@student.com, demo@student.com).

**To run one** (macOS, Linux or WSL on Windows):

1. In one terminal, from `apps/web`: `pnpm local:build` (once after changes), then `pnpm local:serve`
   (the tutor checks need `pnpm local:serve --ai-placeholder`).
2. In another terminal, from `apps/web`: `node scripts/checks/<name>.mjs`.

They print what they found as JSON (an `axe` list should be empty: those are accessibility
problems; `wide: false` means no sideways scrolling). Most add test data to the local database and
remove it at the end; if one stops halfway, run it again or reset the local database (delete
`.wrangler/state` and run `pnpm local:setup`). Browser checks need Playwright's Chromium:
`npm install -g playwright` then `npx playwright install chromium`.

| Script | What it checks |
|---|---|
| `ann-api.mjs` | (helper: tidies up or prepares test data) |
| `attendance-ui.mjs` | Q11 attendance on the built Worker: bulk marks, the frequent-absence flag, suggestions from a class call, an excuse request answered (the day becomes Excused), the seating chart, the location check's switch; then the… |
| `bank-import-ui.mjs` | Question bank import in the browser: a GIFT file and a Canvas QTI package; the preview, what's skipped and why, the import, and the types stored. Axe at 390/1280, light/dark. |
| `cal-api.mjs` | Q12 calendar and timetable APIs on the built Worker: own events (validation, repeat, move, someone else's, series delete), a course event only from its teacher, calendar-file import (and again: replaced), the… |
| `cal-clean.mjs` | (helper: tidies up or prepares test data) |
| `cal-ui.mjs` | Q12 in a browser on the built Worker (time zone Asia/Kolkata): a student taps empty time for a new event, drags it an hour later (Undo puts it back), drags its bottom edge, drags it to the next day, opens it, sees it… |
| `cc-api.mjs` | Common Cartridge export data and import batches on the local Worker. |
| `cc-ui.mjs` | Common Cartridge import and export in the browser on the built Worker. |
| `create-tools-ui.mjs` | M72 + M74: Collaborate → Create in the browser (dev server or built Worker): search (Enter opens), a star, Esc back, the list keeps its scroll spot; the tool bar (focus mode, Esc, `]` next tool, a dropped text file); the bigger tools opened by address and the main ones used. `--new` (M74's 56) or `--old` (the rest). Axe at 1280 dark and 390 light. |
| `clean-calls.mjs` | (helper: tidies up or prepares test data) |
| `copy-run.mjs` | (helper: tidies up or prepares test data) |
| `disc-api.mjs` | (helper: tidies up or prepares test data) |
| `enrol-api.mjs` | (helper: tidies up or prepares test data) |
| `exam-api.mjs` | One-way exams and the hard stop, through the API. |
| `exam-ui.mjs` | One-way exams in the browser: answer, reload (goes on from the next question), hand in; the teacher's switches. Axe at 390/1280, light/dark. |
| `feel-ui.mjs` | M45 as a phone with a finger: swipes on chats, long press and menus as bottom sheets, the Sounds switch; the small menu stays at 1280. Axe, light and dark. |
| `game-api.mjs` | The live quiz game through the API. |
| `game-ui.mjs` | The live quiz game in two browsers at once: the teacher's class screen and a student's phone. Run twice: light (teacher 1280, phone 390) and dark (teacher 390, phone 1280). Axe at each step. |
| `gradebook-ui.mjs` | Post grades, grade history and the grading scale page in the browser. |
| `group-api.mjs` | Group assignments on the local Worker. |
| `home-api.mjs` | (helper: tidies up or prepares test data) |
| `home-clean.mjs` | (helper: tidies up or prepares test data) |
| `home-ui.mjs` | Q8 home pages: Up next changing as the time passes (a class call 12 min away → Join at 10 min → "Now"), Edit home (hide, move, remembered after a reload), the daily goal, the teacher's needs attention and create… |
| `kind-api.mjs` | File and link hand-ins on the local Worker. |
| `kind-group-ui.mjs` | File and link hand-ins and group work in the browser on the built Worker. |
| `landing-story-ui.mjs` | M44 in the browser: the landing's live totals (rounded, none under 10) and the scroll story. 390 and 1280 px, axe. |
| `landing-pause-ui.mjs` | M47: the landing's looping demos run only on screen (the hero moves at the top; scrolled down it holds still and nothing off screen animates). |
| `landing-try-ui.mjs` | M43 in the browser: the landing's Relief, Green and Play demos, and photos shared into a chat. 390 and 1280 px, axe. |
| `live-ui.mjs` | M48–M52: the live cards (constellations, funnels, radars, the fleet city, the hub's planet and wallet cards) on the student, teacher, admin, hub, Relief and Trace pages draw, no sideways scroll, axe at 390 and 1280, light and dark. Runs against `local:dev` too. |
| `world-ui.mjs` | M52: the landing's planet draws; the landing and sign-in pages have no sideways scroll and are axe-clean (whole page) at 390 and 1280. Runs against `local:dev` too. |
| `lesson-ui.mjs` | Rich lesson pages on the built Worker: read (callout, quick check, flashcards), edit, add blocks, save, preview; a new page opens the editor; students read without editing. 390 and 1280 px, light and dark, axe. |
| `make-cc.mjs` | A small Canvas-style cartridge for the browser test. |
| `notes-api.mjs` | Notes on hand-ins on the local Worker. |
| `notes-ui.mjs` | Notes on hand-ins in the browser: words in a typed answer, a box on a PDF page, the student's view. |
| `notify-ui.mjs` | Q9: notification settings (per kind, a muted course, the summary), the course on notifications, snooze hiding from the bell and the centre, mark read / all read, remove, the daily summary sent by the cron; the centre… |
| `offline-ui.mjs` | M46 on the built site as a student's phone: copies of the timetable, courses and chats kept after a visit; offline (the service worker's requests too) the home shows its saved data and a page never opened shows the offline page with today, chats and courses; one bar colour per theme, changed by the theme button; launch screens linked and served. Axe at 390/1280, light/dark. |
| `page-api.mjs` | Rich lesson pages on the local Worker: save, list, load, access, bad input. |
| `passport-ui.mjs` | Q14 skills passport on the built Worker: the portfolio address (taken, too short, reserved refused) and colour, making it public, the wallet credential (signed, no internal id), Add to LinkedIn, Make my CV (look, contact, parts, AI without a key, Save as PDF), the public portfolio and passport link signed out, and /verify (a wallet file genuine, an edited one and random text not valid, a certificate code). Axe at 390/1280, light/dark. |
| `careers-ui.mjs` | Q15 careers on the built Worker: the application tracker (add with a link and a document, Coming up, stage, the next-step reminder from the 15-minute cron, edit, remove), interview practice (questions without AI, filler / STAR / length checks, history), booking a mentor's time from the page (call in the chat, both calendars, the mentor told) and cancelling it, two people booking one time at once, Be a mentor as an alumni student, the teacher's mentor page, the job alerts switch and an alert for a matching new opening (once), and the three tabs in sample mode. Axe at 390/1280, light/dark. Cleans up after itself. |
| `impact-ui.mjs` | Q16 global impact on the built Worker (serve with `pnpm local:serve --payments-test`): Donate on an NGO project, an 80G gift paid and checked on return, the receipt; payment rules (someone else's order, out-of-range amounts, an NGO not taking donations, unsigned webhook); the 10-hour volunteering certificate; the map's UN goal filter; a club's carbon tracker; the admin Donations page; sample mode. Axe at 390/1280, light/dark. Cleans up after itself. |
| `life-ui.mjs` | Q17 student life on the built Worker (serve with `pnpm local:serve --payments-test --test-secret`): free seats and the waiting list, buying a paid ticket and its QR, sold out; a club election (secret vote, receipt, once each, results after closing, receipt found, fingerprint checked) and budget; the campus board (post, message, three reports hide a post, rides); cafeteria pre-order, code, cancel, the kitchen page; the door scanner screen; sample mode. Axe at 390/1280, light/dark. Cleans up after itself. |
| `profile-ui.mjs` | Q18 on the built Worker (`pnpm local:serve`): profile fields saved, a photo cropped and uploaded, a cover photo; the profile page others see (no email; old name links); settings search finds one setting, copies its link, a setting link opens and outlines it; the guided tour's spotlight on the menu item, a closed group, search, the phone's tab bar and More, Next saving progress, Later resuming, Skip ending; sample mode. Axe at 390/1280, light/dark. Puts the accounts back. |
| `phase-e1-ui.mjs` | Q24 (Phase E, third batch) on the built Worker (`pnpm local:serve --test-secret`): Admin → Users (tick two, the bar, Export as CSV, sticky column names, the read-only demo admin refused, a saved view after reloading), renewing an invitation refused for the demo admin, the language button (top bar → Español; the phone's side menu), a chat's "2 new" while reading history and the jump, forwarding with a comment, a notification removed and brought back with Undo (and one really removed), a file dropped and one pasted on the course materials form. Axe at 390/1280, light/dark. Removes what it made. |
| `phase-e2-ui.mjs` | Q25 (Phase E, fourth batch) on the built Worker (`pnpm local:serve --test-secret`): a task card's press-and-hold menu on a phone (Move to another list), Admin → Insights' CSV, choosing several chat messages (copy, forward in order, delete for me with Undo; right-click on a computer, press and hold on a phone), the accent colour (Teal kept after reloading; Amber's contrast) and the ringtone in Settings, my own course colour on its tile, a photo dropped on the profile picture, a whiteboard deleted and brought back with Undo, the share picture and the Status & trust link, the time zone under class calls (in Asia/Kolkata). Axe at 390/1280, light/dark. `SKIP=tasks,chatphone` leaves parts out. Removes what it made. |
| `q26-ui.mjs` | Q26 on the built Worker (`pnpm local:serve --test-secret --owner-test`; port 8790 free for its sign-in key server): the owner writes a blog post in the owner console → Blog (address from the title, Markdown preview), a draft isn't public, published it's listed at `/blog` and read at `/blog/<slug>` (phone and computer), a wrong address says so, the footer links to the blog, taken back it's hidden again; Admin → Reports → Scheduled exports (the test owner made an admin): a monthly teachers export, Save now puts the CSV in My files → Scheduled reports with an in-app note, the demo admin refused, a made-up report refused, Stop removes it; Export CSV on Admin → Analytics' people. Axe at 390/1280, light/dark. Removes what it made (the made-up owner too). |
| `phone-panels.mjs` | The phone's slide-in panels on the built Worker (390 × 844, touch, CPU 4× slower, with a trace): the home logo's ping stops; the side menu's first open restyles only a few elements and its backdrop takes no finger scrolling; the Notifications panel fills the phone, its rows cascade in and still scale when tapped, Escape closes it; in Arabic it slides in and out on the left. Prints the style, layout and paint time of each opening. |
| `peer-api.mjs` | Peer review on the local Worker. |
| `peer-ui.mjs` | Peer review in the browser: the teacher's settings and "Hand out reviews", a student's review form, the reviews beside grading. 390 and 1280 px, light and dark, axe. |
| `policy-api.mjs` | Late penalties, hand-in limits, extensions, reopening and accommodations on the local Worker. |
| `policy-ui.mjs` | Assignment rules in the browser: the teacher's Rules and extensions panel, the late notice and waiver in grading, "Let them hand in again", the student's view, extra time in the Class list. |
| `pools-api.mjs` | Pools and numbers that change per student, through the API. |
| `pools-ui.mjs` | Pools and changing numbers in the browser. Axe at 390/1280, light/dark. |
| `post-api.mjs` | Grades held until posted, and grade history, on the local Worker. |
| `practice-api.mjs` | Adaptive practice through the API. |
| `practice-ui.mjs` | Adaptive practice in the browser: a wrong try with the hint, then right with the explanation; the teacher's switch and hint fields. Axe at 390/1280, light/dark. |
| `q3-api.mjs` | (helper: tidies up or prepares test data) |
| `q4-avatar.mjs` | (helper: tidies up or prepares test data) |
| `q4-photos.mjs` | Q4 check on the built Worker: a chat photo uploads in three sizes and phones load a smaller one. |
| `q4-upload-api.mjs` | (helper: tidies up or prepares test data) |
| `q5-ui.mjs` | Q5 screens on the built Worker: discussion, announcements, teaching team, copy dialog. |
| `q5-ui2.mjs` | (helper: tidies up or prepares test data) |
| `q5-ui3.mjs` | (helper: tidies up or prepares test data) |
| `q5-ui4.mjs` | Calendar tab, syllabus sheet and class list on the built Worker, 390 and 1280 px, light and dark, axe. |
| `qtypes-api.mjs` | Quiz question types through the API: one of each, a student's answers marked, the key hidden, results, item analysis, the bank, and bad input. |
| `qtypes-ui.mjs` | Question types in the browser: the teacher adds a matching question in the editor; a student answers one of each type, hands in, and reads the review. Axe at 390/1280, light/dark. |
| `qtypes2-api.mjs` | Maths, picture and short-answer checking through the API. |
| `qtypes2-ui.mjs` | Maths and picture questions and the short-answer check in the browser. Axe at 390/1280, light/dark. |
| `regrade-api.mjs` | Regrade requests, rubric help and receipts on the local Worker. |
| `replay-api.mjs` | Writing replay through the API: kept with a typed hand-in, checked, read by the teaching team only. |
| `replay-ui.mjs` | Writing replay in the browser: the student writes (typed, a paste, a reload that brings the draft back), hands in; the teacher opens "How it was written". 390 and 1280 px, light and dark, axe. |
| `rubric-keys-ui.mjs` | Rubric level keys in the grader: 0–5 picks a level and moves to the next criterion. Axe, 390/1280, light/dark. |
| `scale-api.mjs` | The school's grading scale on the local Worker. |
| `search-clean.mjs` | (helper: tidies up or prepares test data) |
| `search-ui.mjs` | Q10: search everywhere. Words inside a course document are found by people in the course only; a private document by its owner only; task cards and assignments the same; renames and deletes follow. Then the search… |
| `sheets-ui.mjs` | Spreadsheets in the browser: made from a template, formulas worked out, typing with function suggestions, bold, undo, a second sheet, an Excel download, a comment on a cell, a version kept, and two people editing at… |
| `slides-ui.mjs` | Presentations in the browser: from a template, typing in a title, bold, a shape moved by dragging, a new slide, notes, presenting (keys, presenter view), PowerPoint download, a comment on a slide, a version kept. Axe… |
| `student-side-ui.mjs` | The student side in the browser: status labels, the receipt, regrade request and answer, the receipt check. 390 and 1280 px, light and dark, axe. |
| `team-api.mjs` | (helper: tidies up or prepares test data) |
| `tutor-test.mjs` | Q13 on the built Worker (run with a throwaway GEMINI_API_KEY so "AI on" checks pass; real AI calls fail, so a homework photo's reading is put in the AI cache first, exactly where the tutor keeps it). API: the… |
| `word-ui.mjs` | Word features in a document: style, font size, colour, alignment, superscript, a page break, a table of contents, find and replace, word count, page setup, and the Word copy carrying them. |
