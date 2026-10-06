# UniVerse: Stage 4 plan, "Connect & Create"

A major upgrade of **messaging, calls and collaboration**, to the level of the big platforms (WhatsApp,
Slack, Teams, Zoom, Google Workspace, Miro, Notion, Discord), plus **features nobody else has**,
built around what UniVerse is for: learning, teaching and social impact.

Read `STAGE-3-HANDOFF.md` section 1 first: every rule there still applies (push only when the owner
says, no new emails, new features as tabs inside existing menus, smooth motion, Workers Free limits,
`spendAi` before every AI call, no polling where live updates exist, deploy only by merging).
**Next migration: 0049.**

---

## 0. What already exists (don't rebuild it)

| Area | Already built |
|---|---|
| Messaging | 1:1 chats, groups, communities with channels, threads, voice rooms, presence, status (24 h), view once, link previews, voice notes with transcripts, polls, contacts, location, reactions, pins, starred, search, broadcasts, reminders, translation (auto + per message), AI catch-up, suggested replies, `/ask`, slash commands, offline outbox, disappearing messages |
| Calls | 1:1 and group calls (P2P), big calls through the Cloudflare SFU, class calls, call links, scheduled calls, favourites, hold, call waiting, voicemail, minimise to a floating bar, captions, class recording, class notes → study pack, noise suppression (RNNoise), device picker, voice → video, screen share beside the camera, presenter layout |
| Collaboration | Whiteboard (Excalidraw + `BoardRoom` DO, templates, sharing), code editor (Yjs + `CodeRoom` DO), AI tutor, flashcards, smart planner, offline packs |
| Infra | `RealtimeHub`, `BoardRoom`, `CodeRoom`, `CallRoom` Durable Objects; D1; file uploads; push notifications; Gemini model chain |

---

## Phase 0: Make calls rock-solid (do this first)

People judge the whole product by whether calls work. Nothing new until these pass.

1. **TURN relay on.** Calls on school, office and mobile networks often can't connect directly; they
   need a relay. The code supports Cloudflare Realtime TURN (`src/server/calls.ts`), but only when
   `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` are set. **Owner task:** create the TURN key in Cloudflare
   → Realtime → TURN (free up to 1,000 GB/month) and add both secrets.
2. **Pre-join screen (lobby).**
   - **Before joining:** camera preview, a microphone level meter, a "test speaker" sound, device
     choice, noise level, and camera on/off.
   - **Network check:** quick bitrate and packet-loss estimate, with a "your connection is weak,
     join with audio only?" prompt.
   - **Where:** before `CallView` joins.
3. **Simulcast on the SFU.**
   - **Why:** today everyone receives the sender's single video quality. The camera should send 3
     layers (180p/360p/720p) and each viewer gets the one its tile size and connection can take.
   - **How:** Cloudflare Realtime supports `simulcast` on push and `simulcast.preferredRid` on pull
     (`sfu-client.ts`, `CallRoom.sfuOp`).
4. **Automatic audio-only fallback.** When quality reads "poor" for 10 s, pause incoming video,
   ask before turning yours off, and show a banner.
5. **Call health log.**
   - **What:** each call writes one row (`CallStat`: duration, peers, worst RTT, loss, P2P/SFU,
     TURN used, failure reason). The owner console gets a "Calls" chart.
   - **Done when:** failures can be seen and fixed instead of guessed.
6. **Test matrix (manual, documented):**
   - **Browsers:** Chrome, Safari and Firefox on desktop; Safari on iPhone; Chrome on Android.
   - **Networks:** Wi-Fi ↔ 4G; one side behind strict Wi-Fi (TURN).
   - **Size:** 2, 4 and 12 people.
   - **Actions:** voice → video, share screen, switch devices, lock the phone and come back.

**Done when:** a call connects in under 3 s on all of the above and survives a 10 s network drop.

---

## Phase 1: Messaging at big-platform level

Where: **Messages** (existing menu). New screens are panels or tabs inside it.

| # | Feature | Like | Notes |
|---|---|---|---|
| 1.1 | **Rich text**: bold/italic/strike, `code`, code blocks with syntax colours, quotes, lists, @mentions (people, @here, @channel), message formatting bar | Slack, Discord | Store as limited Markdown; render safely (no HTML). Code colours with a tiny highlighter loaded on demand. |
| 1.2 | **Swipe to reply, long-press menu, full emoji picker**, custom emoji per community | WhatsApp, Discord | Reactions already exist; add the picker and community emoji (uploads, 50 per community). |
| 1.3 | **Edit history** ("edited", tap to see versions), **delete for everyone** window | Telegram | `MessageEdit` table (body, editedAt). |
| 1.4 | **Scheduled send** ("send tomorrow 8:00") and **drafts synced across devices** | Gmail, Slack | `scheduledAt` on a pending message; the existing cron precheck (`callsDue` style, one SQL) sends due ones. Drafts in D1 per conversation. |
| 1.5 | **Read receipts in groups** ("seen by 12", tap for names) and **delivered/read ticks** | WhatsApp | `lastReadAt` exists per participant: compute, don't store per message. |
| 1.6 | **Chat folders and filters**: Unread, Groups, Classes, Communities, custom folders; pin up to 5 chats; archive; mute until… | Telegram | Folders stored per user (JSON). |
| 1.7 | **Albums** (several photos as one grid), **video notes** (round 60 s videos), voice notes at 1.5×/2× with waveform scrubbing, and a **mini player** that keeps playing while you browse | Telegram, WhatsApp | Uploads already exist; compress video client-side before upload (WebCodecs where available). |
| 1.8 | **Inline file previews**: PDF viewer, images zoom, documents' first page | Teams | pdf.js loaded on demand. |
| 1.9 | **Saved replies / snippets** and **message templates** for teachers ("Reminder: lab report due…") | Gmail | Per user, up to 50. |
| 1.10 | **Chat lock** with Face ID / fingerprint (WebAuthn passkey) for chosen chats | WhatsApp | Hides the chat until unlocked on this device. |
| 1.11 | **Huddle in any chat**: one tap starts a voice room in the current chat or channel, with screen share; others see "Huddle · 3" and join | Slack | Reuses voice rooms + `CallRoom`. |
| 1.12 | **Channel canvas**: a living document pinned to each channel (rules, links, notes), edited together | Slack Canvas | Uses the Docs engine from Phase 3. |
| 1.13 | **Moderation tools**: report a message, automod words per community, timeouts, member roles and permissions per channel, audit of moderator actions | Discord | Some moderation exists (`moderation.ts`); add per-community rules. |
| 1.14 | **Message search 2.0**: filters (from:, in:, has:file, has:link, before:/after:), jump to result, search inside voice-note transcripts | Slack | D1 FTS5 virtual table on message bodies and transcripts. |

**Cost:** all D1 + existing DOs; no new services. Videos and albums count toward file storage (cap
sizes; video notes max 60 s).

---

## Phase 2: Meetings and classes at Zoom/Teams level

Where: the call screen (`CallView`), scheduled calls and course Blackboard.

| # | Feature | Notes |
|---|---|---|
| 2.1 | **Participants panel with host controls**: mute all, ask to unmute, remove, lower all hands, spotlight / pin for everyone, make co-host | `CallRoom` already tells host from guest; add `control` messages. |
| 2.2 | **Raise hand with a queue**, **reactions** (floating emoji), **"speaking time" bars** | Hands ordered by time; teacher sees the queue. |
| 2.3 | **In-call chat** (linked to the chat or class), with files and links | Reuse the conversation; side panel on desktop, sheet on phones. |
| 2.4 | **Background blur and replace** | MediaPipe Selfie Segmentation (WASM, on device, free). Process the camera into a canvas track; low-power phones get blur only. |
| 2.5 | **Waiting room / lobby** for class and link calls: the host admits people (or "admit everyone from this course") | `CallRoom` holds a lobby list. |
| 2.6 | **Breakout rooms**: teacher splits the class (random, by group, manual), sets a timer, broadcasts a message, visits rooms, brings everyone back | Each room is a child `CallRoom` (`<call>-room-<n>`); clients move between them. Big win for teaching. |
| 2.7 | **Live polls and quick quizzes in a call** (reuse the quiz engine), results shown live | |
| 2.8 | **Meeting notes for every call** (not just classes): summary, decisions, action items, posted to the chat, with action items offered to the planner | Extends class companion; `spendAi` once per call; text only. |
| 2.9 | **Recording for any call** (opt-in, everyone notified), saved to the chat with chapters and transcript | Storage limits: max 2 h, 720p; owner switch to turn off. |
| 2.10 | **Webinar mode** (up to hundreds watching): presenters on stage, audience view-only, Q&A with upvotes, raise hand to be brought on stage | SFU one-to-many; audience pulls only stage tracks. |
| 2.11 | **Guest links** (no account): name only, always through the lobby, host admits, expires | Abuse-safe: lobby required, rate-limited, no chat history access. |
| 2.12 | **Document Picture-in-Picture** (Chrome): the whole call with controls in a floating window while you use other apps | `documentPictureInPicture` API; falls back to video PiP. |
| 2.13 | **Call history 2.0**: every call with duration, who joined, recording, notes, "call back" | |

---

## Phase 3: A collaboration suite ("Spaces")

Where: **Collaborate** (existing menu) gets tabs: **Spaces · Docs · Boards · Code · Tasks · Files**.

| # | Feature | Notes |
|---|---|---|
| 3.1 | **Spaces**: every course, group project, club and community gets one workspace with its chat, docs, boards, tasks, files and calls in one place | Like a Team in Teams. A thin layer over what exists: a `Space` row linking existing objects. |
| 3.2 | **Docs (new)**: real-time documents (headings, lists, tables, images, checklists, code, embeds of boards), comments, suggestion mode, version history, export to PDF and Word | Tiptap (ProseMirror) + Yjs (already a dependency) + a `DocRoom` DO like `CodeRoom`. Snapshots to D1 every 30 s of activity. |
| 3.3 | **Tasks (new)**: Kanban board and list per space, assignees, due dates (feed the smart planner), checklists, comments, "my tasks" view | D1 tables `Task`, `TaskList`; live updates through `RealtimeHub`. |
| 3.4 | **Whiteboard upgrades**: frames you can present as slides, follow the presenter's view, sticky-note voting and a timer (workshops), comments on shapes, version history, board inside a call (shared tab), export to PDF | Excalidraw supports frames and the laser already. |
| 3.5 | **AI on boards**: sticky notes → themes, sketch → clean diagram, text → mind map, "summarise this board" | One `spendAi` per action. |
| 3.6 | **Code: run and test in the browser**: Python (Pyodide), JavaScript (sandboxed iframe), with teacher-written tests and auto-checks | No server execution (free plan); everything runs on the student's device. |
| 3.7 | **Files hub** per space: folders, previews, versions, "used in" links | Uploads exist; add folders and versions, with per-space quotas. |
| 3.8 | **Presence everywhere**: avatars of who's in a doc, board or code file, with their cursors and selections | Yjs awareness (already used in code). |
| 3.9 | **Mentions and notifications across tools**: @someone in a doc, board comment or task notifies them (in-app + push only) | |

---

## Phase 4: Features nobody else has (the differentiators)

These are what make UniVerse worth choosing over Teams/Zoom/Slack. Each builds on what we have.

1. **Live translated classroom.**
   - **What:** in any call, everyone reads the captions in their own language, live (a student in
     Lyon reads French while the teacher speaks Hindi). Transcripts and study packs come out in each
     person's language too.
   - **How:** captions already exist; translate final captions per language with the cached translate
     API (one translation per language per sentence, shared by everyone reading that language).
   - **Unique:** Zoom and Teams charge extra for it and limit languages; ours is part of the classroom.
2. **Study Hall: a 2D campus you walk around.**
   - **What:** a map of rooms (library, café, lab, quiet zone). Walk your avatar up to people to talk;
     the audio gets louder as you get closer (spatial audio). Sit at a table to join its conversation
     and see its whiteboard. A shared focus timer (Pomodoro) plays for the whole room.
   - **How:** positions through a `HallRoom` DO; audio through the SFU with WebAudio panning by
     distance.
   - **Unique:** Gather does this for offices; nobody does it inside a school platform with
     classes, boards and the tutor.
3. **Fair group work (contribution insight).**
   - **What:** for group projects, the teacher sees who contributed what across the space's docs,
     boards, code, tasks and chat (edits, tasks done, reviews), plus peer ratings. Students see their
     own contribution.
   - **Feeds:** verified contributions become **skill evidence** in the passport (Stage 3 upgrade 2).
   - **Unique:** solves the biggest complaint about group projects, and turns teamwork into proof
     of skills.
4. **Classroom pulse.**
   - **What:** during a class call, students tap "I'm lost" or "Got it" anonymously. The teacher
     sees a live understanding meter and, afterwards, a confusion timeline over the recording,
     with AI suggesting what to re-explain.
   - **How:** counts only, no names (privacy by design).
5. **Ask your semester (learning memory).**
   - **What:** each student gets one search and AI answer box over everything they've opted to
     include: class transcripts, study packs, their notes and docs, assignments and feedback.
     Answers come with links back to the exact class moment or document.
   - **How:** builds on the course tutor's citations; per-user index.
6. **Smart replay.**
   - **What:** every recorded class becomes chaptered and searchable, with "jump to where X was
     explained", a 2-minute recap, and a practice quiz built from what was actually said.
   - **How:** extends the class companion.
7. **Office hours with a queue.**
   - **What:** a teacher opens office hours; students join a visible queue ("you're 3rd, about 8 min").
     When it's their turn the call opens automatically, and the teacher can take notes per student.
   - **How:** builds on scheduled calls and the planner.
8. **Watch together.**
   - **What:** a lecture video (course material) or a YouTube video plays in sync for a group, with
     chat and reactions on the timeline. "Pause for everyone" is available to the host.
   - **How:** sync state through `RealtimeHub`.
9. **Daily brief across everything.**
   - **What:** each morning (in-app and push), what matters today across chats, classes, tasks and
     deadlines: unanswered questions to you, decisions made in your channels, what's due. One tap
     adds suggested tasks to the planner.
   - **How:** one AI request per user per day, cached.
10. **Safe by default for young students.**
    - **What:** an AI guard flags bullying and unsafe messages to moderators, not to the public;
      guardian-visible activity summaries (never message contents); "quiet hours" for students.
      Calls with minors are recorded only with the school's policy on.
    - **Unique:** a trust feature schools look for and consumer apps don't offer.
11. **Data-light mode for weak networks.**
    - **What:** audio-only calls at 16 kbps, image previews on tap, messages that queue offline
      (exists), and a "2G" toggle. This is what makes UniVerse work in places Zoom doesn't.
12. **Impact rooms.**
    - **What:** NGO projects get a public space where volunteers, sponsors and students meet: live
      updates, verified volunteer hours (Stage 3 upgrade 5), donations of time, and a monthly live
      "impact call" recorded with a generated report for sponsors.

---

## Suggested order and size

| Order | Block | Size (rough) | Why this order |
|---|---|---|---|
| 1 | Phase 0 (calls solid) | 1 round | Trust; everything else depends on calls working |
| 2 | Phase 2.1–2.5 (host controls, hands, in-call chat, blur, lobby) | 1–2 rounds | Daily use in classes |
| 3 | Phase 1.1–1.7 (rich text, edit history, scheduled send, receipts, folders, albums, video notes) | 2 rounds | Parity people expect |
| 4 | Phase 3.1–3.3 (Spaces, Docs, Tasks) | 2–3 rounds | The biggest missing piece vs Teams/Workspace |
| 5 | Phase 4.1, 4.4, 4.6 (translated classroom, classroom pulse, smart replay) | 1–2 rounds | Differentiators built on calls + companion |
| 6 | Phase 2.6–2.13 (breakouts, polls, notes for all calls, webinar, guests, PiP) | 2 rounds | |
| 7 | Phase 4.2, 4.3, 4.5, 4.7–4.12 | 3+ rounds | Ground-breaking set |
| 8 | Phase 1.8–1.14, Phase 3.4–3.9 | 2 rounds | Polish and depth |

A "round" is one branch, one commit per feature, typecheck + eslint, tested on real devices where it
touches calls, merged when the owner says.

---

## Costs and limits to respect

- **Workers Free:** 10 ms CPU per request. Heavy work (AI, segmentation, code running, video
  compression) happens on the device or in a Durable Object, never in a request handler.
- **Cloudflare Realtime (SFU + TURN):** 1,000 GB/month free. Use simulcast and audio-only fallback;
  webinar audiences pull one stage layer.
- **Storage:** recordings, video notes and files grow fast. Per-space and per-user quotas, owner
  switches, and automatic deletion of old recordings (owner-set, e.g. 90 days).
- **AI:** everything AI goes through `spendAi` + `featureOff('ai')`; caching for shared work
  (translations, study packs, board summaries).
- **Email:** none of these send email. In-app + push only.

## What we deliberately won't do (now)

- **End-to-end encryption for all chats:** it would switch off AI catch-up, translation, moderation
  and search on the server. Possible later as an opt-in "private chat" for 1:1, clearly labelled.
- **Our own media servers:** stay on Cloudflare Realtime; no servers to run.
- **Native app store apps:** the installed web app first; wrap later if needed.

---

## Progress (keep this up to date, so either agent can take over)

**Branch:** `claude/great-hamilton-8g8xdm`. One commit per feature; typecheck + eslint on the changed
files only; push at each checkpoint; merge only when the owner says "merge". Next migration: `0049`.

**Not merged yet on the branch:** call fixes round 2 (echo, quality, camera while sharing, layout),
the read-only cache log fix (`open-next.config.ts`), this plan, and everything under "Done" below.

### Phase 0
| # | Item | State | Where |
|---|---|---|---|
| 1 | TURN relay | **Owner task**: create the key, set `TURN_KEY_ID` + `TURN_KEY_API_TOKEN` | `src/server/calls.ts` |
| 2 | Pre-join screen | **Done** | `CallView.tsx`: phase `'prejoin'`, `MicMeter`, `playTestSound`, `networkGuess`; class/group/room calls only, chat calls skip it |
| 3 | SFU simulcast | Next | `src/lib/sfu-client.ts`, `CallRoom.sfuOp` |
| 4 | Audio-only fallback | To do | `CallView.tsx` (quality reading already exists) |
| 5 | Call health log | To do | new `CallStat` model, migration `0049`, owner console chart |
| 6 | Test matrix | To do | a checklist at the end of this file |

### Notes for whoever continues
- The pre-join gate is in `open()` in `CallView.tsx`: media opens first, then `resumeJoin.current()`
  sets `joinConfirmed` and calls `open()` again for a fresh ticket.
- The pre-join network hint uses `navigator.connection` (Chrome/Android); Safari shows nothing.
