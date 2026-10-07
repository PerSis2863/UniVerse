import type { Router } from '../router';
import { AssociationStatus, type Prisma } from '@prisma/client';
import { AssociationsService } from '../services/associations.service';
import { BadRequestException } from '../http';
import { audit } from '../audit';
import { oneOf, text } from '../body';

const STATUSES = Object.values(AssociationStatus);

const associations = new AssociationsService();

export default function associationsModule(router: Router) {
  const r = router.controller('associations');

  r.get('', () => associations.findAll());
  r.get('admin/members', { roles: ['ADMIN'] }, () => associations.findAllMembershipsForAdmin());
  r.get('my-memberships', ({ user }) => associations.getUserMemberships(user.id));
  r.get<{ id: string }>(':id', ({ params }) => associations.findOne(params.id));
  r.post<{ id: string }>(':id/join', ({ params, user }) => associations.join(params.id, user.id));
  r.delete<{ id: string }>(':id/leave', ({ params, user }) => associations.leave(params.id, user.id));
  r.post('', ({ body, user }) => associations.create({ name: text(body.name), category: text(body.category), description: text(body.description), requirements: text(body.requirements) }, user.id));
  // Approving and editing associations is for admins (students used to be able to approve their own).
  r.patch<{ id: string }>(':id/status', { roles: ['ADMIN'] }, async ({ params, body, user, req }) => {
    if (!oneOf(STATUSES, body.status)) throw new BadRequestException(`status must be one of ${STATUSES.join(', ')}`);
    const result = await associations.updateStatus(params.id, body.status);
    audit(user, { action: 'association.status_changed', summary: `Set association “${(result as { name?: string }).name ?? params.id}” to ${body.status}`, targetType: 'association', targetId: params.id }, req);
    return result;
  });
  r.patch<{ id: string }>(':id', { roles: ['ADMIN'] }, ({ params, body }) => {
    const data: Prisma.AssociationUpdateInput = {};
    for (const k of ['name', 'category', 'description'] as const) {
      const v = body[k];
      if (typeof v === 'string' && v.trim()) data[k] = v;
    }
    if (body?.budget !== undefined) {
      const budget = Number(body.budget);
      if (!Number.isFinite(budget) || budget < 0) throw new BadRequestException('budget must be a positive number');
      data.budget = budget;
    }
    return associations.update(params.id, data);
  });
}
