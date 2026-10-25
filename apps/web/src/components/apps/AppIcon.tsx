import { Gamepad2, GraduationCap, HandHeart, LayoutGrid, Leaf, ScanLine } from 'lucide-react';
import { APPS, type AppId } from '@/lib/apps';

// An app's tile (src/lib/apps.ts): its icon on a rounded square in the app's colour, with a soft
// glow. `hub` is UniVerse Impact itself.

const ICONS = { campus: GraduationCap, trace: ScanLine, relief: HandHeart, green: Leaf, play: Gamepad2, hub: LayoutGrid } as const;

export function AppIcon({ id, size = 40, className }: { id: AppId | 'hub'; size?: number; className?: string }) {
  const color = APPS.find((a) => a.id === id)?.color ?? '#2a2927';
  const Icon = ICONS[id];
  return (
    <span aria-hidden className={className} style={{
      width: size, height: size, borderRadius: size * 0.3, flexShrink: 0, display: 'grid', placeItems: 'center', color: '#fff',
      background: id === 'hub' ? 'linear-gradient(135deg, #2a2927, #ec4899)' : `linear-gradient(135deg, ${color}, ${color}cc)`,
      boxShadow: `0 6px 18px -6px ${id === 'hub' ? '#ec4899' : color}`,
    }}>
      <Icon style={{ width: size * 0.52, height: size * 0.52 }} strokeWidth={2.2} />
    </span>
  );
}
