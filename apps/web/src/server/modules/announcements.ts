import type { Router } from '../router';
import { AnnouncementsService } from '../services/announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto, validate } from '../dto';
import { assertManagesCourse, assertOwnerOrAdmin } from '../access';

const announcements = new AnnouncementsService();

export default function announcementsModule(router: Router) {
  const r = router.controller('announcements');

  r.post('', { roles: ['ADMIN', 'TEACHER'] }, async ({ body, user }) => {
    const dto = validate<CreateAnnouncementDto>(CreateAnnouncementDto, body);
    if (dto.courseId) await assertManagesCourse(dto.courseId, user);
    return announcements.create(dto, user.id);
  });
  r.get('', ({ user }) => announcements.findAll(user));
  r.get<{ id: string }>(':id', ({ params, user }) => announcements.findOne(params.id, user));
  // Teachers can only change their own announcements.
  r.patch<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, async ({ params, body, user }) => {
    const dto = validate<UpdateAnnouncementDto>(UpdateAnnouncementDto, body);
    assertOwnerOrAdmin((await announcements.findOne(params.id, user)).authorId, user, 'an announcement');
    if (dto.courseId) await assertManagesCourse(dto.courseId, user);
    return announcements.update(params.id, dto);
  });
  r.delete<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, async ({ params, user }) => {
    assertOwnerOrAdmin((await announcements.findOne(params.id, user)).authorId, user, 'an announcement');
    return announcements.remove(params.id);
  });
}
