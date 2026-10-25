import type { Router } from '../router';
import { hubStats } from '../hub';
import { impactWallet } from '../impact-wallet';
import { askUniverse } from '../ask';
import { clearReliefWatch, createReliefPost, reliefAction, reliefMap, reliefMine, reliefWatch, setReliefWatch } from '../relief';
import { addGreenProof, confirmGreenAction, createGreenTeam, deleteGreenAction, greenMap, greenMe, greenProofs, greenTeams, joinGreenTeam, leaveGreenTeam, logGreenAction } from '../green';

// UniVerse Impact's hub and its newer apps (src/lib/apps.ts): /hub, UniVerse Relief (/relief/*) and
// UniVerse Green (/green/*). Everything here needs a signed-in account; nobody's exact position is
// ever returned (src/server/relief.ts, green.ts).

export default function impactAppsModule(router: Router) {
  const hub = router.controller('hub');
  hub.get('', ({ user }) => hubStats(user));
  hub.get('wallet', ({ user }) => impactWallet(user));
  // Ask UniVerse (M30): proposes one action; the box confirms it through the app's own routes.
  router.controller('ask').post('', { status: 200 }, ({ user, body }) => askUniverse(user, body ?? {}));

  const relief = router.controller('relief');
  relief.get('map', ({ user }) => reliefMap(user));
  relief.get('mine', ({ user }) => reliefMine(user));
  relief.get('watch', ({ user }) => reliefWatch(user));
  relief.put('watch', ({ user, body }) => setReliefWatch(user, body ?? {}));
  relief.delete('watch', ({ user }) => clearReliefWatch(user));
  relief.post('posts', ({ user, body }) => createReliefPost(user, body ?? {}));
  relief.post<{ id: string; action: string }>('posts/:id/:action', { status: 200 }, ({ user, params }) => reliefAction(user, params.id, params.action));

  const green = router.controller('green');
  green.get('me', ({ user }) => greenMe(user));
  green.get('map', () => greenMap());
  green.post('actions', ({ user, body }) => logGreenAction(user, body ?? {}));
  green.delete<{ id: string }>('actions/:id', ({ user, params }) => deleteGreenAction(user, params.id));
  green.post<{ id: string }>('actions/:id/proof', { status: 200 }, ({ user, params, body }) => addGreenProof(user, params.id, body ?? {}));
  green.post<{ id: string }>('actions/:id/confirm', { status: 200 }, ({ user, params }) => confirmGreenAction(user, params.id));
  green.get('proofs', ({ user }) => greenProofs(user));
  green.get('teams', ({ user }) => greenTeams(user));
  green.post('teams', ({ user, body }) => createGreenTeam(user, body ?? {}));
  green.post('teams/join', { status: 200 }, ({ user, body }) => joinGreenTeam(user, body ?? {}));
  green.post<{ id: string }>('teams/:id/leave', { status: 200 }, ({ user, params }) => leaveGreenTeam(user, params.id));
}
