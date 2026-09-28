import type { Router } from '../router';
import { MessagesService } from '../services/messages.service';

// REST endpoints of the old messages module. Its socket.io gateway isn't ported: the web app's
// chat uses /api/chat (polling) and never connected to it.
const messages = new MessagesService();

export default function messagesModule(router: Router) {
  const r = router.controller('messages');

  r.get('conversations', ({ user }) => messages.getConversations(user.id));
  r.get<{ id: string }>('conversations/:id', ({ params, user }) => messages.getMessages(params.id, user.id));
  r.post('', ({ user, body }) => messages.sendMessage(user.id, body?.receiverId, body?.body));
  r.post<{ id: string }>('conversations/:id/read', ({ params, user }) => messages.markAsRead(params.id, user.id));
}
