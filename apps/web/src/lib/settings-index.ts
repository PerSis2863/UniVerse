// Every setting by name (Stage 5 · Q18), for the search box in Settings and for links straight to
// one: /<role>/settings?section=<section>&setting=<id> opens the section and scrolls to it. Each id
// matches a data-setting="<id>" in src/components/settings/SettingsApp.tsx.

export type SettingsRole = 'STUDENT' | 'TEACHER' | 'ADMIN';
export interface SettingEntry { id: string; section: string; label: string; keywords: string; roles?: SettingsRole[] }

export const SETTINGS: SettingEntry[] = [
  { id: 'photo', section: 'profile', label: 'Profile photo', keywords: 'avatar picture crop' },
  { id: 'cover', section: 'profile', label: 'Cover photo', keywords: 'banner header background image' },
  { id: 'name', section: 'profile', label: 'Name and phone', keywords: 'full name phone number recovery' },
  { id: 'pronouns', section: 'profile', label: 'Pronouns', keywords: 'she her he him they them' },
  { id: 'bio', section: 'profile', label: 'About me', keywords: 'bio description introduction' },
  { id: 'links', section: 'profile', label: 'Links', keywords: 'website github linkedin portfolio social' },
  { id: 'availability', section: 'profile', label: 'Availability', keywords: 'when free office hours reach me status' },
  { id: 'theme', section: 'appearance', label: 'Theme (light or dark)', keywords: 'dark mode light mode automatic colours' },
  { id: 'text-size', section: 'appearance', label: 'Text size', keywords: 'bigger font larger zoom' },
  { id: 'reading-level', section: 'appearance', label: 'Reading level', keywords: 'simpler words grade easy read' },
  { id: 'select-help', section: 'appearance', label: 'Help with selected text', keywords: 'listen read aloud simpler selection' },
  { id: 'reduce-motion', section: 'appearance', label: 'Reduce motion', keywords: 'animation sliding moving' },
  { id: 'vibration', section: 'appearance', label: 'Vibration', keywords: 'haptics tap buzz' },
  { id: 'bold', section: 'appearance', label: 'Bold text', keywords: 'heavier font' },
  { id: 'contrast', section: 'appearance', label: 'More contrast', keywords: 'darker brighter visibility' },
  { id: 'dyslexic', section: 'appearance', label: 'Dyslexia-friendly font', keywords: 'opendyslexic reading' },
  { id: 'underline', section: 'appearance', label: 'Underline links', keywords: 'links underlined' },
  { id: 'captions', section: 'appearance', label: 'Captions on in calls', keywords: 'subtitles deaf hearing' },
  { id: 'camera-off', section: 'appearance', label: 'Join calls with the camera off', keywords: 'video webcam privacy start' },
  { id: 'language', section: 'language', label: 'Language', keywords: 'translate english hindi french spanish' },
  { id: 'low-data', section: 'language', label: 'Low data mode', keywords: 'data saver slow connection 2g' },
  { id: 'push', section: 'notifications', label: 'Notifications on this device', keywords: 'push allow alerts phone' },
  { id: 'email', section: 'notifications', label: 'Email notifications', keywords: 'emails inbox' },
  { id: 'notify-kinds', section: 'notifications', label: 'What to be told about', keywords: 'mute groups grades messages calls daily summary digest' },
  { id: 'quiet-hours', section: 'notifications', label: 'Quiet hours', keywords: 'do not disturb night sleep silence' },
  { id: 'parent-hours', section: 'notifications', label: 'Hours parents can message', keywords: 'parent guardian contact hours', roles: ['TEACHER', 'ADMIN'] },
  { id: 'privacy-choices', section: 'privacy', label: 'Your privacy choices', keywords: 'privacy data control' },
  { id: 'visibility', section: 'privacy', label: 'Who can find you', keywords: 'network visibility directory search discoverable' },
  { id: 'recordings', section: 'privacy', label: 'Call recordings', keywords: 'recording privacy calls' },
  { id: 'password', section: 'privacy', label: 'Password and two-step sign-in', keywords: 'password 2fa two factor security' },
  { id: 'passkeys', section: 'privacy', label: 'Passkeys', keywords: 'fingerprint face id sign in without password' },
  { id: 'devices', section: 'privacy', label: 'Signed-in devices', keywords: 'sessions sign out everywhere phones computers' },
  { id: 'sign-ins', section: 'privacy', label: 'Recent sign-ins', keywords: 'login history activity security' },
  { id: 'family', section: 'family', label: 'Parents and guardians', keywords: 'family share progress parent', roles: ['STUDENT'] },
  { id: 'consents', section: 'consents', label: 'My consents', keywords: 'permissions agree forms' },
  { id: 'assistant', section: 'ai', label: 'Floating AI assistant', keywords: 'chatbot button corner' },
  { id: 'ai-activity', section: 'ai', label: 'Your AI activity', keywords: 'ai history receipt record' },
  { id: 'organization', section: 'organization', label: 'School settings', keywords: 'school name organization demo sign in', roles: ['ADMIN'] },
  { id: 'offline', section: 'storage', label: 'Offline courses', keywords: 'download courses no internet', roles: ['STUDENT'] },
  { id: 'clear-device', section: 'storage', label: 'Clear data on this device', keywords: 'cache storage space free' },
  { id: 'download-data', section: 'storage', label: 'Download my data', keywords: 'export copy gdpr' },
  { id: 'delete-account', section: 'storage', label: 'Delete my account', keywords: 'remove close account' },
  { id: 'help', section: 'help', label: 'Help and support', keywords: 'contact assistant terms privacy policy accessibility' },
];

/** Settings matching the words typed (all words must match), for someone's role. */
export function searchSettings(term: string, role: SettingsRole) {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SETTINGS.filter((s) => (!s.roles || s.roles.includes(role)) && words.every((w) => `${s.label} ${s.keywords}`.toLowerCase().includes(w)));
}

/** The address of one setting, to share or bookmark. */
export const settingHref = (base: string, s: SettingEntry) => `${base}?section=${s.section}&setting=${s.id}`;
