import type { Router } from '../router';
import { addItem, addShare, myPortfolio, removeItem, removeShare, updateItem } from '../portfolio';
import { acknowledgeAnnouncement, announcementReaders, remindAnnouncement } from '../course-announcements';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { ForbiddenException, NotFoundException } from '../http';
import { guardianWeek } from '../guardian-week';
import { str } from '../body';
import { bookSlot, cancelBooking, officeSlots, openSlots, removeSlot, waitForSlot } from '../office-slots';

/** The course's teachers (or, with `grade`, its teaching assistants too). */
async function teaching(user: SessionUser, courseId: string, grade = false) {
  const a = await courseAccess(courseId, user);
  if (!a) throw new NotFoundException('Course not found.');
  if (!(grade ? a.canGrade : a.canManage)) throw new ForbiddenException('Only the course’s teachers can do that.');
}

// UniVersity's additions from M295 on (the owner's 32 features of 18 Nov), each group under its own path.
export default function schoolPlusModule(router: Router) {
  // Office hours you can book, with a waiting list (M295).
  const slots = router.controller('office-slots');
  slots.get('', ({ user }) => officeSlots(user));
  slots.post('', { roles: ['ADMIN', 'TEACHER'] }, ({ user, body }) => openSlots(user, body));
  slots.post<{ id: string }>(':id/book', { roles: ['STUDENT'] }, ({ user, params, body }) => bookSlot(user, params.id, body));
  slots.post<{ id: string }>(':id/wait', { roles: ['STUDENT'] }, ({ user, params, body }) => waitForSlot(user, params.id, body));
  slots.post<{ id: string }>(':id/cancel', { roles: ['STUDENT'] }, ({ user, params }) => cancelBooking(user, params.id));
  slots.delete<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, ({ user, params }) => removeSlot(user, params.id));

  // Portfolio work and private share links (M296): each person's own.
  const pf = router.controller('portfolio');
  pf.get('', ({ user }) => myPortfolio(user));
  pf.post('items', ({ user, body }) => addItem(user, body));
  pf.patch<{ id: string }>('items/:id', ({ user, params, body }) => updateItem(user, params.id, body));
  pf.delete<{ id: string }>('items/:id', ({ user, params }) => removeItem(user, params.id));
  pf.post('shares', ({ user, body }) => addShare(user, body));
  pf.delete<{ token: string }>('shares/:token', ({ user, params }) => removeShare(user, params.token));

  // Announcements: who has seen one, a reminder to the rest, "I've read it" (M299).
  const ann = router.controller('course-announcements');
  ann.get<{ courseId: string; id: string }>(':courseId/:id/readers', async ({ user, params }) => { await teaching(user, params.courseId, true); return announcementReaders(params.courseId, params.id); });
  ann.post<{ courseId: string; id: string }>(':courseId/:id/remind', async ({ user, params }) => { await teaching(user, params.courseId); return remindAnnouncement(params.courseId, params.id); });
  ann.post<{ courseId: string; id: string }>(':courseId/:id/ack', { roles: ['STUDENT'] }, ({ user, params }) => acknowledgeAnnouncement(params.courseId, user, params.id));

  // A parent's week for one linked child (M300).
  router.controller('parent-week', { roles: ['GUARDIAN'] }).get('', ({ user, query }) => guardianWeek(user, str(query.studentId) ?? '', str(query.week)));
}
