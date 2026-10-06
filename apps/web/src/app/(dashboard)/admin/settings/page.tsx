'use client';

import { SettingsApp } from '@/components/settings/SettingsApp';

// Settings for admins: the shared Settings app (src/components/settings/SettingsApp.tsx).
export default function Settings() {
  return <SettingsApp role="ADMIN" />;
}
