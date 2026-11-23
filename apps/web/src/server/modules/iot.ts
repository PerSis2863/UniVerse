import type { Router } from '../router';
import { first } from '../body';
import { channelEntries, createChannel, deleteChannel, myChannels, renewKey, updateChannel, writeEntry } from '../iot';

// Hyperion Signals → IoT (M475, src/server/iot.ts): a person's channels are theirs alone; a device writes with the
// channel's write key (public routes: the key is the password, as Trace's carrier key is).
export default function iotModule(router: Router) {
  const r = router.controller('iot');
  r.get('channels', ({ user }) => myChannels(user));
  r.post('channels', ({ user, body }) => createChannel(user, body ?? {}));
  r.patch<{ id: string }>('channels/:id', ({ user, params, body }) => updateChannel(user, params.id, body ?? {}));
  r.delete<{ id: string }>('channels/:id', ({ user, params }) => deleteChannel(user, params.id));
  r.post<{ id: string }>('channels/:id/key', ({ user, params }) => renewKey(user, params.id));
  r.get<{ id: string }>('channels/:id/entries', ({ user, params, query }) => channelEntries(user, params.id, first(query.after), first(query.limit)));
  r.post<{ key: string }>('write/:key', { public: true, status: 200 }, ({ params, body }) => writeEntry(params.key, body ?? {}));
  r.get<{ key: string }>('write/:key', { public: true }, ({ params, query }) => writeEntry(params.key, Object.fromEntries(Object.entries(query).map(([k, v]) => [k, first(v)]))));
}
