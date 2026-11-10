import type { Router } from '../router';
import { hubStats } from '../hub';
import { impactWallet } from '../impact-wallet';
import { askUniverse } from '../ask';
import { createRoom, playLeaderboard, playMe, roomInfo, roomTicket, saveSoloScore } from '../play';
import { clearReliefWatch, createReliefPost, reliefAction, reliefMap, reliefMine, reliefWatch, setReliefWatch } from '../relief';
import { addReliefSupply, cancelReliefShift, createReliefOrg, createReliefShift, deleteReliefSupply, joinReliefOrg, leaveReliefOrg, leaveReliefShift, newReliefOrgCode, reliefOrg, reliefOrgs, setReliefOrgMember, signUpReliefShift, updateReliefOrg, updateReliefSupply, reliefPlaces, setReliefOrgStatus } from '../relief-orgs';
import { closeReliefText, inboundText } from '../relief-texts';
import { addGreenProof, confirmGreenAction, createGreenTeam, deleteGreenAction, greenMap, greenMe, greenProofs, greenTeams, joinGreenTeam, leaveGreenTeam, logGreenAction, setGreenFeeling } from '../green';

// UniVerse Impact's hub and its newer apps (src/lib/apps.ts): /hub, UniVerse Relief (/relief/*),
// UniVerse Green (/green/*) and UniVerse Play (/play/*). Everything here needs a signed-in account;
// nobody's exact position is ever returned (src/server/relief.ts, green.ts).

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
  // M148: the shelter and supply board (src/server/relief-orgs.ts).
  relief.get('places', () => reliefPlaces());
  relief.put<{ id: string }>('orgs/:id/status', ({ user, params, body }) => setReliefOrgStatus(user, params.id, body ?? {}));
  relief.put('watch', ({ user, body }) => setReliefWatch(user, body ?? {}));
  relief.delete('watch', ({ user }) => clearReliefWatch(user));
  relief.post('posts', ({ user, body }) => createReliefPost(user, body ?? {}));
  relief.post<{ id: string; action: string }>('posts/:id/:action', { status: 200 }, ({ user, params, body }) => reliefAction(user, params.id, params.action, body ?? {}));
  // Organisations (M106, src/server/relief-orgs.ts): members only, coordinators run them.
  relief.get('orgs', ({ user }) => reliefOrgs(user));
  relief.post('orgs', ({ user, body }) => createReliefOrg(user, body ?? {}));
  relief.post('orgs/join', { status: 200 }, ({ user, body }) => joinReliefOrg(user, body ?? {}));
  relief.get<{ id: string }>('orgs/:id', ({ user, params }) => reliefOrg(user, params.id));
  relief.patch<{ id: string }>('orgs/:id', ({ user, params, body }) => updateReliefOrg(user, params.id, body ?? {}));
  relief.post<{ id: string }>('orgs/:id/code', { status: 200 }, ({ user, params }) => newReliefOrgCode(user, params.id));
  relief.post<{ id: string }>('orgs/:id/leave', { status: 200 }, ({ user, params }) => leaveReliefOrg(user, params.id));
  relief.patch<{ id: string; userId: string }>('orgs/:id/members/:userId', ({ user, params, body }) => setReliefOrgMember(user, params.id, params.userId, body ?? {}));
  relief.delete<{ id: string; userId: string }>('orgs/:id/members/:userId', ({ user, params }) => setReliefOrgMember(user, params.id, params.userId, null));
  relief.post<{ id: string }>('orgs/:id/supplies', ({ user, params, body }) => addReliefSupply(user, params.id, body ?? {}));
  relief.patch<{ id: string; sid: string }>('orgs/:id/supplies/:sid', ({ user, params, body }) => updateReliefSupply(user, params.id, params.sid, body ?? {}));
  relief.delete<{ id: string; sid: string }>('orgs/:id/supplies/:sid', ({ user, params }) => deleteReliefSupply(user, params.id, params.sid));
  relief.post<{ id: string }>('orgs/:id/shifts', ({ user, params, body }) => createReliefShift(user, params.id, body ?? {}));
  relief.delete<{ id: string; sid: string }>('orgs/:id/shifts/:sid', ({ user, params }) => cancelReliefShift(user, params.id, params.sid));
  relief.post<{ sid: string }>('shifts/:sid/signup', { status: 200 }, ({ user, params }) => signUpReliefShift(user, params.sid));
  relief.delete<{ sid: string }>('shifts/:sid/signup', ({ user, params }) => leaveReliefShift(user, params.sid));
  // Text requests (M107, src/server/relief-texts.ts): Twilio's webhook (signed, behind the owner's
  // "Relief text requests" switch) and closing a message.
  relief.post('texts/inbound', { public: true, status: 200 }, ({ req, body }) => inboundText(req, body ?? {}));
  relief.post<{ id: string }>('texts/:id/close', { status: 200 }, ({ user, params }) => closeReliefText(user, params.id));

  // UniVerse Play (M31): rooms, seats, scores and leaderboards (src/server/play.ts).
  const play = router.controller('play');
  play.get('me', ({ user }) => playMe(user));
  play.get('leaderboard', ({ user, query }) => playLeaderboard(user, query.game, query.range));
  play.post('scores', { status: 200 }, ({ user, body }) => saveSoloScore(user, body ?? {}));
  play.post('rooms', ({ user, body }) => createRoom(user, body ?? {}));
  play.get<{ code: string }>('rooms/:code', ({ params }) => roomInfo(params.code));
  play.post<{ code: string }>('rooms/:code/ticket', { status: 200 }, ({ user, params }) => roomTicket(user, params.code));

  const green = router.controller('green');
  green.get('me', ({ user }) => greenMe(user));
  green.get('map', () => greenMap());
  green.post('actions', ({ user, body }) => logGreenAction(user, body ?? {}));
  green.delete<{ id: string }>('actions/:id', ({ user, params }) => deleteGreenAction(user, params.id));
  green.post<{ id: string }>('actions/:id/proof', { status: 200 }, ({ user, params, body }) => addGreenProof(user, params.id, body ?? {}));
  green.post<{ id: string }>('actions/:id/feeling', { status: 200 }, ({ user, params, body }) => setGreenFeeling(user, params.id, body ?? {}));
  green.post<{ id: string }>('actions/:id/confirm', { status: 200 }, ({ user, params }) => confirmGreenAction(user, params.id));
  green.get('proofs', ({ user }) => greenProofs(user));
  green.get('teams', ({ user }) => greenTeams(user));
  green.post('teams', ({ user, body }) => createGreenTeam(user, body ?? {}));
  green.post('teams/join', { status: 200 }, ({ user, body }) => joinGreenTeam(user, body ?? {}));
  green.post<{ id: string }>('teams/:id/leave', { status: 200 }, ({ user, params }) => leaveGreenTeam(user, params.id));
}
