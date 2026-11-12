import type { Tone } from '@/components/ui/StatusBadge';

/** An audit action's verb: "user.role_changed" → "role changed". */
export const verb = (action: string) => action.split('.').slice(1).join(' ').replace(/_/g, ' ');

/** M141: what came of it, as the reels' outcome labels: kept or given (green), refused or removed (red),
 *  waiting on someone (amber), a plain change (blue). The words are the action's own. */
export function outcomeOf(action: string): { tone: Tone; label: string } {
  const v = verb(action);
  const label = v ? v[0].toUpperCase() + v.slice(1) : 'Done';
  if (/reject|revok|delet|remov|suspend|ban|deni|declin|fail|expel/.test(v)) return { tone: 'red', label };
  if (/request|pend|flag|submit|report|wait|review|appeal/.test(v)) return { tone: 'amber', label };
  if (/approv|verif|issu|grant|publish|restor|accept|award|creat|enrol/.test(v)) return { tone: 'green', label };
  return { tone: 'blue', label };
}
