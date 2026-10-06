# UniVerse: Stage 4 plan, "Connect & Create"

A major upgrade of **messaging, calls and collaboration**, to the level of the big platforms (WhatsApp,
Slack, Teams, Zoom, Google Workspace, Miro, Notion, Discord), plus **features nobody else has**,
built around what UniVerse is for: learning, teaching and social impact.

Read `STAGE-3-HANDOFF.md` section 1 first: every rule there still applies (push only when the owner
says, no new emails, new features as tabs inside existing menus, smooth motion, Workers Free limits,
`spendAi` before every AI call, no polling where live updates exist, deploy only by merging).
**Next migration: 0058** (see Progress).

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
files only; push at each checkpoint; merge only when the owner says "merge". Next migration: `0058`.

**Not merged yet on the branch:** call fixes round 2 (echo, quality, camera while sharing, layout),
the read-only cache log fix (`open-next.config.ts`), this plan, and everything under "Done" below.

### Phase 0
| # | Item | State | Where |
|---|---|---|---|
| 1 | TURN relay | **Owner task**: create the key, set `TURN_KEY_ID` + `TURN_KEY_API_TOKEN` | `src/server/calls.ts` |
| 2 | Pre-join screen | **Done** | `CallView.tsx`: phase `'prejoin'`, `MicMeter`, `playTestSound`, `networkGuess`; class/group/room calls only, chat calls skip it |
| 3 | SFU simulcast | **Done** (needs a real-device check) | `sfu-client.ts`: `CAMERA_LAYERS` a/b/c, `pull` with a layer, `prefer`; `worker.ts` `CallRoom.sfuOp` `pull` (falls back to a plain pull) and `layer` → `tracks/update`; `CallView.tsx` `syncSfu` picks the layer, `noteSfuQuality` steps down when poor |
| 4 | Audio-only fallback | **Done** | `CallView.tsx`: `setLowData`, `poorSince` (poor 10 s while a camera is on), banner "Resume video" / "Turn my camera off"; P2P senders stop their camera to that person (`tuneSenders(pc, sendCamera)`, `lowData` in the room's `state` message), SFU stops pulling cameras; screens stay. Quality now uses packet loss since the last reading |
| 5 | Call health log | **Done** | `CallStat` (migration `0049_call_stats.sql`), `POST /api/calls/:id/stat` → `recordCallStat`, owner console → Calls tab (`console/calls.tsx`, `GET /owner/calls` → `callHealth`). One row per person per call; kept 90 days; erased with the account |
| 6 | Test matrix | **Done** (to be run on real devices) | "Call test checklist" at the end of this file |

**Phase 0 is built** (TURN keys are set by the owner).

### Phase 1 (messaging: 1.1–1.7 built; 1.8–1.14 come later per "Suggested order")
| # | Item | State | Where |
|---|---|---|---|
| 1.1 | Rich text | **Done** | `src/components/chat/RichText.tsx` (`parseBlocks` + inline parser: `**bold**`/`*bold*`, `_italic_`, `~strike~`, `` `code` ``, fenced code blocks with a language label and Copy, `>` quotes, `-`/`1.` lists, links, @mentions, `@here`/`@channel`/`@everyone`; marks only at word edges; 1–3 emoji drawn large; React elements only, never HTML). Code colours: `src/lib/highlight.ts` (tiny regex tokenizer, dynamic import). Composer: "Aa" formatting bar, ⌘/Ctrl B I E ⇧X, Enter makes a new line inside an open code block, `@here`/`@channel` suggestions (`canMentionAll`: group admins, groups of up to 50, community mods). Server: `notifyMentions` sends `@here` (online) / `@channel` (everyone, cap 500) with `notifyMany`, in-app only. Previews strip marks (`plainText` in `chat-client.ts`) |
| 1.2 | Emoji picker, community emoji | **Done** (swipe to reply and the long-press menu already existed) | `src/components/chat/EmojiPicker.tsx` (search, groups, recents in localStorage, "This community" group; `EmojiGlyph` draws `:name:` as its picture) with `src/lib/emoji-data.ts` (about 1,200 emoji with search words, dynamic import). In the message box (inserts at the caret) and for reactions ("+" after the quick six). Reactions: any one emoji (`isReactionEmoji` in `src/lib/chat.ts`) or the community's `:name:`, at most 20 different per message. Community emoji: `CommunityEmoji` (migration `0050_community_emoji.sql`), `listEmoji`/`addEmoji`/`removeEmoji` in `src/server/communities.ts`, `/api/chat/communities/:cid/emoji`, up to 50, moderators; pictures shrunk to 128 px on the device; the channel's list comes with the thread (`channel.emoji`) and `RichText` draws known `:name:` as pictures |
| 1.3 | Edit history, delete window | **Done** | `MessageEdit` (migration `0051_message_edits.sql`): `PATCH /api/chat/messages/:id` keeps the earlier text (`writtenAt` = when that version was written; latest 20 kept; an edit that changes nothing is refused). `GET /api/chat/messages/:id/edits` lists versions newest first, for the chat's members; none for deleted messages or ones UniVerse edited or removed (the owner console keeps its own record). "edited" in the bubble opens `EditHistory` (portal sheet). Delete for everyone: your own within 48 h (`DELETE_WINDOW_MS`), group admins any time; history goes with it |
| 1.4 | Scheduled send, synced drafts | **Done** | Migration `0052_drafts_and_scheduled_messages.sql`. **Scheduled:** `ScheduledMessage` rows, sent by the 15-minute cron (`cloudflare/worker.ts` precheck has a `scheduled_messages` UNION; `/api/cron/reminders` calls `sendDueScheduled()` in `src/server/scheduled-messages.ts`), so `sendAt` must be a quarter hour, up to 30 days ahead (20 per chat, 100 per person). A sent row is deleted; the message gets `clientId` `sched-<id>` so the cron and Send now can't both send it. At send time the sender must still be able to post (else dropped + in-app notice with the text, no email). Slow-mode channels: members get one scheduled message per quarter hour. APIs: `GET/POST /api/chat/conversations/:id/scheduled`, `PATCH/POST(send now)/DELETE /api/chat/scheduled/:sid`; the thread (Next route and fast-chat) returns `scheduled`. UI: hold or right-click Send, or Attach → Schedule message (`ScheduleSheet`), `ScheduledBar` above the box. Everything after a message is saved now lives in `afterSend()` (`src/server/chat-notify.ts`), shared by both. **Drafts:** `conversation_participants.draft/draftAt`, saved by `PATCH …/prefs { draft }` 2 s after typing stops (and on leaving the chat or page); `src/lib/chat-drafts.ts` keeps each change on the device, newer copy wins; thread + chat lists (both Next and fast-chat) return my own draft only; the list shows “Draft:”. Not cleared by the message POST on purpose (avoids a race with an in-flight draft save); the composer clears it |
| 1.5 | Read receipts in groups, delivered ticks | **Done** | Nothing new stored. `ChatWindow.readState`: read = every other member's `lastReadAt` ≥ the message; delivered = someone read it, is online, or has `lastSeenAt` after it (hidden last-seen only counts once read); else sent (one tick). `MessageBubble`: ✓ sent, ✓✓ delivered, blue ✓✓ read. Groups: "Seen by N" / "Seen by everyone" under my latest message opens `MessageInfo`, which now lists Read by, Delivered, Not delivered yet |
| 1.6 | Folders, filters, pins, mute until | **Done** | Filters All / Unread / Direct / Groups plus my folders as chips (`MessagingHub.tsx`; there's no class or community chat in the chat list, so no such filters). Folders: `users.chatFolders` JSON (migration `0053_chat_folders.sql`), `GET/PUT /api/chat/folders` (10 folders × 200 chats, cleaned on the server), `src/components/chat/ChatFolders.tsx` (`FolderSheet`, `MuteUntilSheet`; `Sheet` is now exported from `ChatDialogs.tsx`); add/remove from the chat's menu. Pins: up to 5 (`MAX_PINNED` in the prefs route). Mute: 1 h, 8 h, 1 week, until a chosen time (`muted: { until }`, up to a year), always; lists (Next route and `cloudflare/fast-chat.ts`) return `mutedUntil`. Sample stubs for `/api/chat/folders` |
| 1.7 | Albums, video notes, voice waveforms, mini player | **Done** | **Albums:** pick several photos (media input is `multiple`) → `Composer.pickMedia` → `SendPayload.album` → `ChatWindow.send` uploads each, posts one IMAGE with `album` (server: 2–10, each `isOwnBlobUrl` + image mime → `metadata.album`); `MessageBubble` grid (4 shown, "+n"). **Voice:** `src/lib/voice-player.ts` (one app-wide `Audio`, `useVoice` store, `fallbackBars`); `VoicePlayer` draws bars and seeks by tap/drag/arrow keys; waveform recorded in `Composer.startRecording` (analyser every 100 ms → 40 bars 0–31 → `metadata.waveform`, ≤64 kept); `MiniPlayer` (mounted in `DashboardShell`) shows while the playing message isn't on screen (`voice.shown`). View-once audio uses `LocalVoicePlayer`. **Video notes:** `src/components/chat/VideoNote.tsx` (`VideoNoteRecorder` from Attach → Video note: round preview, 60 s, 700 kbps, retake/send; `VideoNoteBubble`: silent loop, tap for sound with a progress ring); server sets `metadata.videoNote` + `durationSec` for VIDEO. No client-side video compression beyond the recording bitrate (WebCodecs left for later) |

### Phase 2 (2.1–2.7 built; next per "Suggested order": Phase 1.1–1.7 (messaging), then Phase 3.1–3.3)
| # | Item | State | Where |
|---|---|---|---|
| 2.1 | People panel + host controls | **Done** | `src/components/call/PeoplePanel.tsx`; `CallRoom.control()` in `cloudflare/worker.ts` (mute, mute everyone, ask to unmute, stop video, spotlight, co-host, remove → `removed:<userId>` for 4 h). Hosts: `callAccess` in `src/server/calls.ts` (teacher, group creator/admins, room mods, group chat call starter/admins); link creators via `CallRoom` `/creator` (`createCallLink`). `welcome` carries `host`, `cohost`, `spotlight` |
| 2.2 | Raise hand, reactions, speaking time | **Done** | `CallRoom`: `hand` (time on the socket = queue order), `react` (6 emoji, 8 per 4 s), `lower-hand`/`lower-all` controls. `src/components/call/Reactions.tsx` (bar + floating emoji); hand badge with queue number on tiles; speaking time from `useSpeaking` → `meter.talk`, shown in PeoplePanel. Footer is now Mic, Camera, Share, Hand, React, More (captions, devices, flip, record, notes, PiP), Leave |
| 2.5 | Waiting room | **Done** | `CallRoom`: `waiting` on the socket (kept out of `peers()`), `lobby` setting (default on for call links that have a creator), `admitted:<userId>` (4 h), `knock` / `lobby-left` / `lobby-setting` to hosts, `admit` / `admit-all` / `deny` / `lobby` controls, `join()` sends `welcome` with the waiting list to hosts. CallView phase `'lobby'` (waiting screen); PeoplePanel "Waiting to join" + on/off switch; badge on the People button |
| 2.3 | In-call chat | **Done** | `src/components/call/CallChat.tsx` (`useCallChat` + `CallChatPanel`). Chat calls and voice rooms use their chat (`chatId` from `callAccess`); class, group and link calls use the call room's own chat (`CallRoom` `chat` message, `chat:*` storage, last 100 sent in `welcome`, cleared when the room empties; per-viewer `mine`, no account ids sent). Files via `uploadChatFile`, links linkified, images inline; unread badge on the Chat button |
| 2.4 | Background blur/replace | **Done** (smoke-tested in headless Chromium: engine loads from `/mediapipe/wasm`, GPU mask OK; needs a real-device check) | `src/lib/call-background.ts` (MediaPipe `@mediapipe/tasks-vision` selfie segmenter on a 320×180 copy of each frame, canvas → `captureStream`, worker-timer ticks so background tabs keep sending), `BackgroundSheet.tsx` (none, blur, strong blur, 4 drawn scenes, your picture kept in localStorage). `CallView.applyCamera` is the one path for camera changes; a saved background holds the camera until it's ready, and a failure keeps the camera off. Engine copied at build by `scripts/copy-mediapipe-assets.mjs` (gitignored); model `public/mediapipe/selfie_segmenter.tflite` committed; `/mediapipe` excluded from the service-worker precache |
| 2.6 | Breakout rooms | **Done** (tested end to end in the Workers runtime with `wrangler dev` and several fake participants: open, passes, visits, messages, help, moving people, timer, closing, "they choose"; needs a real-device check of moving between rooms) | `src/components/call/BreakoutPanel.tsx`: the host's panel (shuffle / I choose / they choose, 1–20 rooms, timer), the strip at the top (time left, ask for help, switch room, back), the room picker. `CallRoom` (`cloudflare/worker.ts`): the main call keeps the plan in `bo` (rooms, people with short keys instead of account ids, `endsAt`, `closing`, `choose`, `note`) and who's in each room in `bocc:<n>`; `boControl` handles `bo-open`, `bo-assign`, `bo-note`, `bo-time`, `bo-close`, `bo-end`, `boPick` handles `bo-pick`, and `alarm()` runs the timer and the 30 s close. Rooms are call rooms named `<call>~b<n>` that ask the main call (`/breakout-state`, `/breakout-occupancy`, `/breakout-host`, `/breakout-pick`, `/breakout-help`) and get its changes on `/relay`; a room knows its call from `self` (saved from the join address). `callTicket` asks the main call (`/breakout-pass`) whether the room is yours (hosts and co-hosts may visit any room); a room chats in its own room. `CallView`: `room` + `goRoom` (a new connection, the same camera, mic and screen: the connection effect's cleanup keeps media while `moving`); everyone but hosts moves automatically; leaving from a room leaves the whole call |
| 2.7 | Live polls and quick quizzes | **Done** (tested in the Workers runtime: who sees what, live counts, changing answers, quizzes hiding answers, late joiners, validation) | `src/components/call/CallPoll.tsx`: `PollComposer` (poll or quick quiz, 2–6 options, the right answer for quizzes, anonymous switch, "Ask a question from this class's quizzes" for class calls via `GET /api/calls/:id/questions` → `callQuestions` in `src/server/calls.ts`, teacher only) and `PollCard` (answer, live bars, folds into a pill). `CallRoom`: one poll at a time in `poll` (cleared with the call's chat), `pollControl` (`poll-start`, `poll-end`, `poll-clear`, hosts and co-hosts), `vote` (a new answer replaces the last while open), `pollView` (results for hosts always; others after answering a poll, or when it ends; a quiz hides answers and the right one until it ends; names only for hosts and only when not anonymous), results pushed at most every 700 ms. Each breakout room has its own poll |

### Phase 3 (3.1–3.3 built; next per "Suggested order": Phase 4.1, 4.4, 4.6)
| # | Item | State | Where |
|---|---|---|---|
| 3.3 | Tasks | **Done** | Migration `0054_tasks.sql` (`TaskBoard`, `TaskBoardMember`, `TaskList`, `Task`, `TaskComment`). `src/server/tasks.ts` (access: owner, members EDITOR/VIEWER, or everyone in the board's course; every change `publish`es a refresh of `/api/tasks/<id>` to the board's people, up to 300; assigning and commenting notify in-app only). Routes under `src/app/api/tasks` (`/`, `/:id`, `/:id/members`, `/:id/lists`, `/:id/items`, `/lists/:lid`, `/items/:tid`, `/items/:tid/comments`). Pages `src/app/(dashboard)/tasks` (My tasks by Overdue/Today/This week/Later, boards, new board for me or a course) and `tasks/[id]` (Board/List views, drag between lists on computers, card sheet: done, list, assignee, due, notes, checklist, comments; share by email). Collaborate tab "Tasks"; cards due this week go into the smart planner (`plannerTasks`, kind `TASK`). Sample stubs added |
| 3.2 | Docs | **Done** (suggestion mode not built: it needs paid Tiptap add-ons; comments quote text instead of anchoring) | Tiptap 3 (`@tiptap/react`, starter-kit, collaboration + collaboration-caret, table, list, image, extensions; `@tiptap/y-tiptap`) on Yjs. The live text uses the **existing `CodeRoom` Durable Object** in a room named `doc:<id>` (same binary protocol as code rooms, 512 KB cap) — no worker changes. Migration `0055_docs.sql` (`Doc`, `DocMember`, `DocVersion`, `DocComment`). `src/server/docs.ts` (access like tasks; `docTicket`; versions: saved by editors' apps 8 s after typing stops and on leaving, at most one unnamed per 2 min, last 50 unnamed kept, named ones kept; comments with an optional quote; refresh via `publish`). Routes `src/app/api/docs/**`. `src/components/docs/DocEditor.tsx` (`DocEditor` + `DocToolbar`), pages `src/app/(dashboard)/docs` and `docs/[id]` (title, presence, comments panel with go-to-quote, version history with read-only preview and restore, share by email, PDF via print, Word as .doc). Styles `.doc-prose` in `globals.css`. Collaborate tab "Docs" |
| 3.1 | Spaces | **Done** | No `Space` table: a space *is* a course or a study group. Migration `0056_space_groups.sql` adds `groupId` to `task_boards` and `docs` (group members see and edit; group creator/admins/moderators manage) via `groupAccess`/`groupPeople` in `src/server/spaces.ts`; tasks and docs create forms offer "Everyone in <group>" (`c:`/`g:` values). `GET /api/spaces` (my courses and groups), `GET /api/spaces/:kind/:id` (`getSpace`: call id `c_`/`g_`, docs, boards + open tasks, code rooms for courses, up to 60 people). Pages `src/app/(dashboard)/spaces` and `spaces/[kind]/[id]` (call button, New doc / New board made for the space). Collaborate tabs: Spaces · Whiteboards · Docs · Code together · Tasks |

### Phase 4 (in progress: 4.1, 4.4 built; next 4.6 smart replay)
| # | Item | State | Where |
|---|---|---|---|
| 4.1 | Live translated classroom | **Done** (call room part tested with `scripts/test-call-room.mjs`; real AI translation needs the Gemini key, so it's untested locally) | **Captions:** speakers send `lang` (their recognition language) with each caption; `CallRoom` gives finished sentences an id and, per language someone reads in (`cc-lang` message: `ccLang`, `ccDevice` on the socket), asks ONE reader to translate (`cc-do`; prefers a browser with the built-in Translator API), then relays `cc-tr` to everyone reading that language (`askTranslators`, `trAsked`). Browser: `src/lib/caption-translate.ts` (Chrome/Edge on-device Translator when the pair is downloaded; else `POST /api/calls/:id/captions` in 3 s batches → `translateCaptions` in `src/server/translate.ts`, counted as one staff allowance per call `cc:<callId>` + the site). `CallView`: "Captions in …" in More (default the app language, or "as spoken"; `universe:cc-lang`), translated lines marked with a 🌐 icon; while translating, a speaker's last sentence stays up during their next words. **Study packs:** "Read in <my language>" on each pack (`ClassSessions.tsx`) → `GET /api/class-sessions/:id/translation?to=` → `translatePack` (one AI request per pack per language, kept in `ai_cache`; key moments keep their times) |
| 4.4 | Classroom pulse | **Done** (call room part tested with `scripts/test-call-room.mjs`: counts, anonymity, leaving) | `CallRoom`: `pulse` message ('lost' / 'got' / null, students only) kept on the socket but never sent to others (`publicPeer` strips it from `welcome`/`joined`); hosts get `{ type: 'pulse', lost, got, total }` throttled (`pulseTell`, `PULSE_PUSH_MS`) and in their `welcome`. `src/components/call/ClassPulse.tsx`: `PulseButtons` (class calls, under the captions; a tap clears itself after 2 min, `PULSE_MS`) and `PulseMeter` (hosts, top of the call). `CallView`: `tapPulse`, `gotPulse` (a toast when ≥30% and ≥2 are lost, at most every 3 min); while class notes are on the teacher's browser keeps the counts over time and sends them with the transcript. Migration `0057_class_pulse.sql`: `class_sessions.pulse` and `reexplain`; `createClassSession` cleans the pulse (`cleanPulse`), the AI prompt gets the lost moments per half minute and returns `reexplain` (0–4 topics, teacher only; `sessionsForBoard` leaves both out for students). `src/components/dashboard/PulseTimeline.tsx`: got it above / lost below a line per minute (rose and sky, colour-blind checked), hover counts, a bar opens the recording there, plus the AI's "Worth going over again" list |

### Notes for whoever continues
- **Call room tests:** `node scripts/test-call-room.mjs` runs the real `CallRoom` (breakout rooms and live polls,
  44 checks) in the Workers runtime with fake participants, no deploy needed; `TIMER=1` adds the breakout timer
  (about 2 minutes). Run it after changing `CallRoom`.
- The pre-join gate is in `open()` in `CallView.tsx`: media opens first, then `resumeJoin.current()`
  sets `joinConfirmed` and calls `open()` again for a fresh ticket.
- The pre-join network hint uses `navigator.connection` (Chrome/Android); Safari shows nothing.
- Simulcast was written without access to Cloudflare's docs (blocked here). The request shapes are
  `simulcast: { preferredRid, priorityOrdering: 'asciibetical', ridNotAvailable: 'asciibetical' }` on
  pull and `PUT /sessions/:id/tracks/update` to change layer. If the SFU rejects them, pulls fall back
  to the old single-size pull, so calls keep working; check the Worker logs for `SFU 4xx` after deploy.

---

## Call test checklist (Phase 0, item 6)

Run after each deploy that touches calls. Two people (or two devices in **different rooms**, with
headphones: two devices in one room echo whatever the software does). After each run, check the
owner console → **Calls** tab: every join should be there, and failures should say why.

**Devices:** Chrome on Mac/Windows · Safari on Mac · Firefox · Safari on iPhone (installed app and
browser) · Chrome on Android.

| # | What to do | Pass when |
|---|---|---|
| 1 | Chat call, voice, phone ↔ computer | Rings, connects in under 3 s, both hear each other; the phone keeps its own mic (no Continuity takeover) |
| 2 | Turn the camera on mid-call, then off | Video appears/disappears smoothly on both sides, no black tile |
| 3 | Share a screen while the camera is on | The other side sees the screen big and your camera in the strip; text is readable |
| 4 | Switch microphone and camera in Devices & noise | Switches without dropping the call |
| 5 | Noise: Strong vs Off with a fan or typing nearby | Strong removes it; Off lets it through |
| 6 | Class or group call | Pre-join screen: preview, mic meter moves, "Test speaker" plays, who's already in shows; Join connects |
| 7 | Wi-Fi ↔ 4G (turn Wi-Fi off mid-call on the phone) | Call recovers within ~10 s without leaving |
| 8 | Strict network (school/office Wi-Fi, or a VPN that blocks UDP) | Connects; the Calls tab shows "TURN" for it (needs the TURN keys) |
| 9 | Throttle one side (Chrome DevTools → Network → "3G") for 15 s | "Weak connection" banner, video pauses, audio continues; "Resume video" brings it back |
| 10 | Lock the phone for 30 s and come back | Audio continued, or the call reconnects by itself |
| 11 | 4 people, then 12 (bigger call, SFU) | Everyone hears everyone; grids look sharp; with a shared screen the camera strip still works |
| 12 | Leave, and close the tab mid-call | The others see you leave; your join appears in the Calls tab |

**Done when:** 1–12 pass on every device above, calls connect in under 3 s (Calls tab "Time to
connect"), and survive a 10 s network drop.
