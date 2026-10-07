import type { Router } from '../router';
import { CollaborationsService } from '../services/collaborations.service';
import { audit } from '../audit';
import { text } from '../body';

const collaborations = new CollaborationsService();

export default function collaborationsModule(router: Router) {
  const r = router.controller('collaborations');

  r.get('my', ({ user }) => collaborations.getMyCollabs(user.id));
  r.post('', ({ user, body }) => collaborations.create(user.id, body));
  r.patch<{ id: string }>(':id', ({ params, user, body }) => collaborations.update(params.id, user, body));
  r.get('projects', ({ user }) => collaborations.getProjects({ detailed: user.role === 'ADMIN' }));
  r.get<{ id: string }>('projects/:id', ({ params, user }) => collaborations.getProjectById(params.id, user));
  r.post('projects', { roles: ['TEACHER', 'ADMIN'] }, ({ user, body }) => collaborations.createProject(user.id, body));
  r.patch<{ id: string }>('projects/:id', ({ params, user, body }) => collaborations.updateProject(params.id, user, body));
  r.delete<{ id: string }>('projects/:id', ({ params, user }) => collaborations.deleteProject(params.id, user));
  r.post<{ id: string }>('projects/:id/join', ({ params, user }) => collaborations.joinProject(params.id, user));
  r.patch<{ id: string }>('projects/:id/review', { roles: ['ADMIN'] }, async ({ params, body, user, req }) => {
    const project = await collaborations.reviewProject(params.id, text(body.status));
    audit(user, { action: 'project.reviewed', summary: `Set project “${(project as { title?: string }).title ?? params.id}” to ${body.status}`, targetType: 'project', targetId: params.id, metadata: { status: body.status } }, req);
    return project;
  });
  r.post<{ id: string }>('projects/:id/milestones', ({ params, user, body }) => collaborations.createMilestone(params.id, user, body));
  r.patch<{ milestoneId: string }>('projects/milestones/:milestoneId', ({ params, user, body }) => collaborations.updateMilestone(params.milestoneId, user, body));
}
