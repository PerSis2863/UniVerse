import type { Router } from '../router';
import { SkillsService } from '../services/skills.service';

const skills = new SkillsService();

export default function skillsModule(router: Router) {
  const r = router.controller('skills');

  r.get('my', ({ user }) => skills.findByUser(user.id));
  r.get<{ userId: string }>('user/:userId', ({ params }) => skills.findByUser(params.userId));
  r.post('', ({ user, body }) => skills.upsert(user.id, body));
  r.delete<{ id: string }>(':id', ({ params, user }) => skills.remove(params.id, user.id));
}
