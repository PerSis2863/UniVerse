import type { Router } from '../router';
import { CollaborationsService } from '../services/collaborations.service';

const collaborations = new CollaborationsService();

export default function collaborationsModule(router: Router) {
  const r = router.controller('collaborations');

  r.get('my', ({ user }) => collaborations.getMyCollabs(user.id));
  r.post('', ({ user, body }) => collaborations.create(user.id, body));
  r.patch<{ id: string }>(':id', ({ params, user, body }) => collaborations.update(params.id, user, body));
  r.get('projects', () => collaborations.getProjects());
  r.get<{ id: string }>('projects/:id', ({ params }) => collaborations.getProjectById(params.id));
  r.post('projects', { roles: ['TEACHER', 'ADMIN'] }, ({ user, body }) => collaborations.createProject(user.id, body));
  r.patch<{ id: string }>('projects/:id', ({ params, user, body }) => collaborations.updateProject(params.id, user, body));
  r.delete<{ id: string }>('projects/:id', ({ params, user }) => collaborations.deleteProject(params.id, user));
  r.post<{ id: string }>('projects/:id/join', ({ params, user }) => collaborations.joinProject(params.id, user));
  r.patch<{ id: string }>('projects/:id/review', { roles: ['ADMIN'] }, ({ params, body }) => collaborations.reviewProject(params.id, body.status));
  r.post<{ id: string }>('projects/:id/milestones', ({ params, user, body }) => collaborations.createMilestone(params.id, user, body));
  r.patch<{ milestoneId: string }>('projects/milestones/:milestoneId', ({ params, user, body }) => collaborations.updateMilestone(params.milestoneId, user, body));
}
