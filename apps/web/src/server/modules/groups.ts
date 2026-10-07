import type { Router } from '../router';
import { GroupsService } from '../services/groups.service';
import { strings } from '../body';

const groups = new GroupsService();

export default function groupsModule(router: Router) {
  const r = router.controller('groups');

  r.get('', ({ query }) => groups.findAll(query));
  r.get('my', ({ user }) => groups.findMyGroups(user.id));
  r.get<{ id: string }>(':id', ({ params, user }) => groups.findOne(params.id, user.id));
  r.post('', ({ user, body }) => groups.create(user.id, body));
  r.post<{ id: string }>(':id/join', ({ params, user }) => groups.join(params.id, user.id));
  r.delete<{ id: string }>(':id/leave', ({ params, user }) => groups.leave(params.id, user.id));
  r.get<{ id: string }>(':id/posts', ({ params, user }) => groups.getPosts(params.id, user.id));
  r.post<{ id: string }>(':id/posts', ({ params, user, body }) => groups.createPost(params.id, user.id, body));
  r.post<{ id: string }>(':id/invite', ({ params, user, body }) => groups.inviteMembers(params.id, user.id, strings(body.emails)));
}
