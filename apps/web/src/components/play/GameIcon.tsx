import { Footprints, Ghost, Rocket, Brain, Globe2, Keyboard, LifeBuoy, Recycle, ScanSearch, Ship, Truck } from 'lucide-react';
import { GAMES, type GameId } from '@/lib/play';
import { cn } from '@/lib/utils';

// Each UniVerse Play game's mark: its icon on a tile in the game's colour, with a soft glow.
export const GAME_ICON: Record<GameId, typeof Brain> = { quiz: Brain, fakes: ScanSearch, supply: Truck, sort: Recycle, type: Keyboard, pin: Globe2, rescue: LifeBuoy, ocean: Ship, obby: Footprints, night: Ghost, orbit: Rocket };

export function GameIcon({ game, size = 'md', className }: { game: GameId; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = GAME_ICON[game], color = GAMES[game].color;
  return (
    <span className={cn('relative grid shrink-0 place-items-center text-white', size === 'sm' ? 'h-7 w-7 rounded-lg' : size === 'md' ? 'h-11 w-11 rounded-xl' : 'h-20 w-20 rounded-3xl', className)}
      style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)`, boxShadow: size === 'lg' ? `0 12px 40px ${color}55` : `0 4px 14px ${color}40` }} aria-hidden>
      <Icon className={size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-10 h-10'} />
    </span>
  );
}
