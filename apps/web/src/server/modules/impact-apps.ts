import type { Router } from '../router';
import prisma from '@/lib/db';
import { parseShownApps } from '@/lib/shown-apps-list';
import { hubStats } from '../hub';
import { impactWallet } from '../impact-wallet';
import { askUniverse } from '../ask';
import { arrangeGet, arrangeOff, arrangePut } from '../arrange';
import { createRoom, playLeaderboard, playMe, roomInfo, roomTicket, saveSoloScore } from '../play';
import { clearReliefWatch, createReliefPost, reliefAction, reliefMap, reliefMine, reliefWatch, setReliefWatch } from '../relief';
import { addReliefSupply, cancelReliefShift, createReliefOrg, createReliefShift, deleteReliefSupply, joinReliefOrg, leaveReliefOrg, leaveReliefShift, newReliefOrgCode, reliefOrg, reliefOrgs, setReliefOrgMember, signUpReliefShift, updateReliefOrg, updateReliefSupply, reliefPlaces, setReliefOrgStatus } from '../relief-orgs';
import { closeReliefText, inboundText } from '../relief-texts';
import { declareIncident, endIncident, markSafe, reliefContacts, reliefIncidents } from '../relief-safety';
import { reliefSmsOn } from '../relief-sms';
import { aidFollowing, aidPublic, createAid, followAid, orgAid, stepAid } from '../relief-aid';
import { removeTravelPlace, saveTravelPlace, travelGuide, travelSaved, travelSearch, travelVisa, travelWeather } from '../travel';
import { addTravelItem, addTravelStop, createTravelTrip, deleteTravelTrip, joinTravelTrip, moveTravelItems, newTravelTripCode, orderTravelStops, removeTravelItem, removeTravelStop, removeTravelTripMember, travelTrip, travelTrips, updateTravelItem, updateTravelStop, updateTravelTrip } from '../travel-trips';
import { blockTraveller, joinTravelBoard, leaveTravelBoard, messageTraveller, reportTraveller, travelBoard, unblockTravellers } from '../travel-board';
import { addGreenProof, confirmGreenAction, createGreenTeam, deleteGreenAction, greenMap, greenMe, greenProofs, greenTeams, joinGreenTeam, leaveGreenTeam, logGreenAction, setGreenFeeling } from '../green';

// UniVerse Impact's hub and its newer apps (src/lib/apps.ts): /hub, UniVerse Relief (/relief/*),
// UniVerse Green (/green/*), UniVerse Play (/play/*) and UniVerse Travel (/travel/*). Everything here needs a signed-in account;
// nobody's exact position is ever returned (src/server/relief.ts, green.ts).

// M203: the apps the website shows (the owner console → Server → Apps on the website), for every visitor,
// signed in or not; read at most once a minute per Worker copy. Nothing about anyone.
let shown: { apps: string[]; at: number } | null = null;
async function shownApps() {
  if (!shown || Date.now() - shown.at > 60_000) {
    const row = await prisma.serverControl.findUnique({ where: { id: 'main' }, select: { apps: true } }).catch(() => null);
    shown = { apps: parseShownApps(row?.apps), at: Date.now() };
  }
  return { apps: shown.apps };
}

export default function impactAppsModule(router: Router) {
  router.controller('site').get('apps', { public: true }, () => shownApps());
  const hub = router.controller('hub');
  hub.get('', ({ user }) => hubStats(user));
  hub.get('wallet', ({ user }) => impactWallet(user));
  // Ask UniVerse (M30): proposes one action; the box confirms it through the app's own routes.
  router.controller('ask').post('', { status: 200 }, ({ user, body }) => askUniverse(user, body ?? {}));
  // M166: a person's page arrangements on their other devices, when they turn it on (src/server/arrange.ts).
  const arrange = router.controller('arrange');
  arrange.get('', ({ user }) => arrangeGet(user));
  arrange.put('', ({ user, body }) => arrangePut(user, body ?? {}));
  arrange.delete('', ({ user }) => arrangeOff(user));

  const relief = router.controller('relief');
  relief.get('map', ({ user }) => reliefMap(user));
  relief.get('mine', ({ user }) => reliefMine(user));
  relief.get('watch', ({ user }) => reliefWatch(user));
  // M150: the "I'm safe" check-in (src/server/relief-safety.ts).
  relief.get('incidents', ({ user, query }) => reliefIncidents(user, query));
  relief.post('incidents', ({ user, body }) => declareIncident(user, body ?? {}));
  relief.post<{ id: string }>('incidents/:id/end', { status: 200 }, ({ user, params }) => endIncident(user, params.id));
  relief.post<{ id: string }>('incidents/:id/safe', { status: 200 }, ({ user, params, body }) => markSafe(user, params.id, body ?? {}));
  relief.get('contacts', ({ user }) => reliefContacts(user));
  relief.get('sms', () => reliefSmsOn());
  relief.get<{ id: string }>('orgs/:id/aid', ({ user, params }) => orgAid(user, params.id));
  relief.post<{ id: string }>('orgs/:id/aid', ({ user, params, body }) => createAid(user, params.id, body ?? {}));
  relief.post<{ id: string }>('aid/:id/step', { status: 200 }, ({ user, params, body }) => stepAid(user, params.id, body ?? {}));
  relief.get<{ code: string }>('aid/:code', { public: true }, ({ params }) => aidPublic(params.code));
  relief.get<{ code: string }>('aid/:code/follow', ({ user, params }) => aidFollowing(user, params.code));
  relief.post<{ code: string }>('aid/:code/follow', { status: 200 }, ({ user, params, body }) => followAid(user, params.code, body ?? {}));
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

  // UniVerse Travel (M202, src/server/travel.ts): guides, facts and weather from public sources, saved places.
  const travel = router.controller('travel');
  travel.get('search', ({ user, query }) => travelSearch(user, query));
  travel.get('guide', ({ user, query }) => travelGuide(user, query));
  travel.get('weather', ({ user, query }) => travelWeather(user, query));
  travel.get('visa', ({ user, query }) => travelVisa(user, query));
  travel.get('saved', ({ user }) => travelSaved(user));
  travel.post('saved', ({ user, body }) => saveTravelPlace(user, body ?? {}));
  travel.delete<{ id: string }>('saved/:id', ({ user, params }) => removeTravelPlace(user, params.id));
  // M206 (src/server/travel-trips.ts): trips planned alone or with friends; every route checks membership.
  travel.get('trips', ({ user }) => travelTrips(user));
  travel.post('trips', ({ user, body }) => createTravelTrip(user, body ?? {}));
  travel.post('trips/join', ({ user, body }) => joinTravelTrip(user, body ?? {}));
  travel.get<{ id: string }>('trips/:id', ({ user, params }) => travelTrip(user, params.id));
  travel.patch<{ id: string }>('trips/:id', ({ user, params, body }) => updateTravelTrip(user, params.id, body ?? {}));
  travel.delete<{ id: string }>('trips/:id', ({ user, params }) => deleteTravelTrip(user, params.id));
  travel.post<{ id: string }>('trips/:id/code', ({ user, params }) => newTravelTripCode(user, params.id));
  travel.delete<{ id: string; userId: string }>('trips/:id/members/:userId', ({ user, params }) => removeTravelTripMember(user, params.id, params.userId));
  travel.post<{ id: string }>('trips/:id/stops', ({ user, params, body }) => addTravelStop(user, params.id, body ?? {}));
  travel.post<{ id: string }>('trips/:id/stops/order', ({ user, params, body }) => orderTravelStops(user, params.id, body ?? {}));
  travel.patch<{ id: string; stopId: string }>('trips/:id/stops/:stopId', ({ user, params, body }) => updateTravelStop(user, params.id, params.stopId, body ?? {}));
  travel.delete<{ id: string; stopId: string }>('trips/:id/stops/:stopId', ({ user, params }) => removeTravelStop(user, params.id, params.stopId));
  travel.post<{ id: string }>('trips/:id/items', ({ user, params, body }) => addTravelItem(user, params.id, body ?? {}));
  travel.post<{ id: string }>('trips/:id/items/move', ({ user, params, body }) => moveTravelItems(user, params.id, body ?? {}));
  travel.patch<{ id: string; itemId: string }>('trips/:id/items/:itemId', ({ user, params, body }) => updateTravelItem(user, params.id, params.itemId, body ?? {}));
  travel.delete<{ id: string; itemId: string }>('trips/:id/items/:itemId', ({ user, params }) => removeTravelItem(user, params.id, params.itemId));
  // M207 (src/server/travel-board.ts): the travellers board, adults who opt in, by city and dates.
  travel.get('board', ({ user, query }) => travelBoard(user, query));
  travel.post('board', ({ user, body }) => joinTravelBoard(user, body ?? {}));
  travel.delete<{ id: string }>('board/:id', ({ user, params }) => leaveTravelBoard(user, params.id));
  travel.post<{ id: string }>('board/:id/message', ({ user, params }) => messageTraveller(user, params.id));
  travel.post<{ id: string }>('board/:id/report', ({ user, params, body }) => reportTraveller(user, params.id, body ?? {}));
  travel.post<{ id: string }>('board/:id/block', ({ user, params }) => blockTraveller(user, params.id));
  travel.delete('blocks', ({ user }) => unblockTravellers(user));

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
