# UniVerse UI kit

One look everywhere: iOS-style, two-tone indigo → fuchsia, light and dark. Use these before
writing your own markup. Styles that are only CSS live in `src/app/globals.css` (classes below);
anything with behaviour is a component in this folder. Motion presets are in `src/lib/motion.ts`
(`spring.*`, `fadeUp`, `list`); always import framer-motion as `m as motion`.

## CSS classes (globals.css)

| Class | Use for |
|---|---|
| `btn-primary` | The one main action on a screen or sheet (Save, Send, Publish). |
| `btn-secondary` | Other actions next to it (Cancel, Edit, Export). |
| `btn-ghost` | Low-key actions in toolbars and lists. |
| `btn-danger` | Delete / leave / remove (after a confirm or with Undo). |
| `btn-sm`, `btn-lg`, `btn-icon` | Sizes; add to any button class. |
| `panel` | The frosted card pages are built from (sections, lists, forms). No padding: add `p-4`/`p-5`. |
| `card`, `card-hover` | Solid cards with padding (dashboard tiles, clickable cards). |
| `input` | Every text field, `select` and `textarea`. Add `pl-10` when there's an icon. |
| `label` | A field's label (or use `Field`). |
| `badge` + `badge-green/amber/red/blue` | Status pills (or use `Badge`). |
| `ios-list`, `ios-cell`, `ios-section-header` | Grouped lists (or use `ListSection` / `Cell`). |
| `ios-segmented` | Segmented controls (or use `Segmented`). |
| `skeleton` | A shimmering placeholder block while something loads. |

Don't write one-off button or field styles (`rounded-xl bg-indigo-600 …`): use the classes.

## Components

| Component | File | When to use |
|---|---|---|
| `Button` | `Button.tsx` | A button with a built-in loading state (`loading`) that keeps its width. |
| `Link` | `Link.tsx` | Every internal link (never prefetches; see the rules). |
| `Sheet` | `Sheet.tsx` | A bottom sheet on phones / dialog on desktop: forms, pickers, details. Escape, swipe down and tapping outside close it; focus stays inside. |
| `confirmDialog`, `promptDialog` | `Dialogs.tsx` | Yes/no and one-line questions (`await confirmDialog({...})`). Prefer an Undo toast when the action can be undone. |
| `EmptyState` | `EmptyState.tsx` | A list or page with nothing in it yet: icon, title, one-line hint, one action. `compact` inside cards. |
| `ContentSkeleton`, `Skeleton*` | `ContentSkeleton.tsx`, `SkeletonCard.tsx` | Loading placeholders shaped like the final layout (`list`, `grid`, `table`, `dashboard`). |
| `FeatureGuide` | `FeatureGuide.tsx` | First-run explanation of a feature with an example and steps (bigger than an empty state). |
| `ListSection`, `Cell` | `List.tsx` | Settings-style grouped lists; cells can link, act, or show a value/switch. |
| `Field`, `SearchField` | `Field.tsx` | A labelled field with hint, error and counter wired for screen readers; a search box with clear. |
| `Badge` | `Badge.tsx` | Status pills by meaning: green done, amber waiting, red problem, blue info, zinc neutral. |
| `Avatar`, `AvatarStack` | `Avatar.tsx` | A person's photo or initials (same colour per name); overlapping avatars with "+N". |
| `PresenceStack` | `PresenceStack.tsx` | Who's here right now in a live doc/board/code room. |
| `Segmented` | `Segmented.tsx` | Switching between 2–5 views of the same thing. |
| `TabPill`, `TabPanel` | `Glide.tsx` | The gliding highlight under tabs, and tab content that slides. Section tabs: `layout/SectionTabs.tsx`. |
| `Switch` | `Switch.tsx` | On/off settings (applies immediately, no Save button). |
| `ProgressRing` | `ProgressRing.tsx` | Progress toward a goal (study minutes, completion), Apple Fitness style. |
| `KpiCard` | `../dashboard/KpiCard.tsx` | A number with a label and trend on dashboards. |
| `Combobox` | `Combobox.tsx` | Picking one item from a long list with search (universities, people). |
| `MentionInput` | `MentionInput.tsx` | A one-line input that suggests people after "@". |
| `WhenVisible` | `WhenVisible.tsx` | Render something heavy only when it scrolls into view. |
| `QrCode`, `RotatingQr` | `QrCode.tsx`, `RotatingQr.tsx` | QR codes; rotating ones for attendance. |

## Every screen

- **Loading:** a skeleton shaped like the content (reserve the height, no jumps).
- **Empty:** `EmptyState` with the next step.
- **Error:** a short message and a Retry button.
- **Motion:** content fades up (`fadeUp`), lists stagger (`list`), sheets spring; respect Reduce Motion (the presets do).
- **Phones:** 44 px touch targets, no horizontal scroll at 375 px.
