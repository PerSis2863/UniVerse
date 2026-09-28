import type { Router } from '../router';
import { AnnouncementsService } from '../services/announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto, validate } from '../dto';

const announcements = new AnnouncementsService();

export default function announcementsModule(router: Router) {
  const r = router.controller('announcements');

  r.post('', { roles: ['ADMIN', 'TEACHER'] }, ({ body, user }) => announcements.create(validate<CreateAnnouncementDto>(CreateAnnouncementDto, body), user.id));
  r.get('', () => announcements.findAll());
  r.get<{ id: string }>(':id', ({ params }) => announcements.findOne(params.id));
  r.patch<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, ({ params, body }) => announcements.update(params.id, validate<UpdateAnnouncementDto>(UpdateAnnouncementDto, body)));
  r.delete<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, ({ params }) => announcements.remove(params.id));
}
