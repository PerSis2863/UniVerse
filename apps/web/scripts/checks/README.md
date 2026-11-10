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
| `create-tools-ui.mjs` | M72 + M74: Collaborate → Create in the browser (dev server or built Worker): search (Enter opens), a star, Esc back, the list keeps its scroll spot; the tool bar (focus mode, Esc, `]` next tool, a dropped text file); the bigger tools opened by address and the main ones used. `--m75` (M75's 55), `--new` (M74's 56) or `--old` (the rest). Axe at 1280 dark and 390 light. |
| `create-saves-ui.mjs` | M75 + M76: saved work in Create: save a mind map, the list, a view link opened signed out (`/s/<token>`), the copy link kept by another person, an edit link (401 signed out) with two people editing live, stop sharing (both links 404), delete; someone else's save is 404, only `uv-` keys, no email in the shared answer. Axe. |
| `create-course-ui.mjs` | M80: a teacher (tara, CS101) uses Share → Add to a course in Create: the sheet lists their courses and modules, the work lands as a view link in a module, a student of the course sees it and it opens without sign-in; students aren't offered it. Axe at 390 light and 1280 dark. Removes what it made. |
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
| `first-impression-ui.mjs` | M116–M117 (dev server or built Worker): the student home picture never over the hero and the hero picture's cards inside it, at six laptop and desktop sizes; the landing's bigger headline (96 px from 1280, read with its spaces), the student home pictured under it (a phone below 768 px, a window above, flat once scrolled to, gone on Trace's tab, where Trace's own picture loads); sign-in and sign-up fit a 390 px screen (nothing past the right edge); no glass on the form cards, the scrolled top bar and the app tabs; the logo reads UniVerse Impact. Axe at 390 and 1280, light and dark. |
| `app-backdrop-ui.mjs` | M129 (dev server or built Worker): each app's own scene behind the page: one background canvas on the landing, changing with every app tab (the page's frames timed through each switch), on sign-in with the chosen app, and inside the apps (`/student`, `/trace`). Axe on the landing at 390 and 1280, light and dark. |
| `motion-pass-ui.mjs` | M130 on the built Worker: the landing's app switch timed frame by frame, content replacing a loading placeholder gliding in on the teacher's home, and no glide with Reduce Motion. |
| `world-globe-ui.mjs` | M131: the landing's globe you can use: an app's button opens its card, the planet turns to face it, a click in the planet's middle picks it again, the card closes; frames while it turns; axe with the card open at 390 and 1280, light and dark. |
| `app-colours-ui.mjs` | M132: each app its own colour: on the landing (?app=…) and inside each app, `html[data-app]` names the app and the main button wears its colour; axe in dark and light. |
| `card-menu-ui.mjs` | M139: the cards' "···" menu: on the grades page Full screen (and its menu inside it), Copy and Download as CSV work; no CSV without a table; a sheet on phones; axe on the pages that carry it at 390 and 1280, light and dark. |
| `calendar-ballast-ui.mjs` | M140: the calendars' Timeline (student, teacher, admin; sample mode): cards, Now, a class opens, the admin's clashes in amber, none on phones; the date range picker on the audit log (quick choice, Apply, arrow keys, Cancel); axe at 390 and 1280, light and dark. |
| `activity-log-ui.mjs` | M141: the activity log in sample mode: 168 heatmap squares and the busiest times in words, every row with an outcome label, a tab's count matches its rows, details open; axe at 390 and 1280, light and dark. |
| `template-windows-ui.mjs` | M142: New course's six kinds (credits, ticks and description follow the choice; arrow keys) and New event's cards; axe with each window open at 390 and 1280, light and dark. |
| `courses-center-ui.mjs` | M143: a teacher's courses (sample mode): summary line and pill, the three summary cards, 14 columns per course card, New course opens, Open board goes to the board; axe at 390 and 1280, light and dark. |
| `trace-history-api.mjs` | M145: a unit's repairs through the API: the owner's (by its owner) and the brand's (by the brand) are added, a stranger and an empty one refused, the passport lists both newest first. |
| `trace-takeback-api.mjs` | M146: take-back for recycling through the API: the offer, owner-only asking with a hidden drop-off code, refusals, the brand receiving once, TAKEBACK points and the Green action. |
| `trace-fakes-api.mjs` | M147: reports of fake labels through the API: refused for a genuine unit, once per person on a likely copy, signed in, the brand's Radar lists the shop without the reporter. |
| `relief-places-api.mjs` | M148: the shelter board through the API: a coordinator shares the status, a volunteer can't, beds clamped, the board shows it without codes or people, signed out refused. |
| `relief-skills-api.mjs` | M149: skills matching through the API: a helper with the skill hears "Your skill is needed" despite narrow filters, others the usual alert, never the asker. |
| `launch-focus-ui.mjs` | M110–M113 on the built Worker: the landing's four Lab tags and Play's worlds without the rated ones, the hub's Lab tags, Relief's emergency line, and a teacher's class link from publishing a draft to a student joined (sent back to the link after signing in, "Not now", a sign-up with no card check). Axe at 390 and 1280, light and dark. |
| `live-ui.mjs` | M48–M52: the live cards (constellations, funnels, radars, the fleet city, the hub's planet and wallet cards) on the student, teacher, admin, hub, Relief and Trace pages draw, no sideways scroll, axe at 390 and 1280, light and dark. Runs against `local:dev` too. |
| `world-ui.mjs` | M52: the landing's planet draws; the landing and sign-in pages have no sideways scroll and are axe-clean (whole page) at 390 and 1280. Runs against `local:dev` too. |
| `lesson-ui.mjs` | Rich lesson pages on the built Worker: read (callout, quick check, flashcards), edit, add blocks, save, preview; a new page opens the editor; students read without editing. 390 and 1280 px, light and dark, axe. |
| `make-cc.mjs` | A small Canvas-style cartridge for the browser test. |
| `messages-pro-ui.mjs` | M121 Messages: the panes solid, Mark all as read surviving a reload, Alt+↓/↑ between chats and Esc closing, on phones the message box's width and the chat's full name. Axe at 1280 and 390, light and dark. `BASE=http://localhost:3000 WAIT=6000` for `local:dev`. |
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
| `play-gfx-ui.mjs` | M118 on the built Worker: a 3D game's Graphics button (Balanced → Sharp → Smooth, kept on the device, its name saying the choice), none on the flat games, the river resting while a game covers the page (`data-arena`) and waking after, each round's WebGL context given back. Axe at 1280 light and 390 dark (touch). |
| `play-voyager-ui.mjs` | M123 Solar Voyager (or `BASE=` for local:dev): a solo round draws, the marker names the planet to survey next, flying forward from the start surveys Earth (count, score, its card), the phone's Boost / Up / Down buttons, no errors, no sideways scroll. Axe at 1280 dark and 390 light (touch). |
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
| `stormfall-ui.mjs` | M41 STORMFALL on the built Worker: on a computer the /play card, the 16+ question, the Unity download and start with no Content-Security-Policy blocks or page errors (a screenshot of the game goes to the temp folder); on a phone no card, a notice instead, nothing downloaded. Ridgeline Ops gone. Axe light/dark. |
