import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { cleanAnchor, type Anchor } from '@/lib/note-anchor';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';

// Notes on a hand-in (Stage 5 · B3.3): the teaching team pins comments to a box on a PDF page or a
// picture, or to words in a typed answer (src/lib/note-anchor.ts). The student (and their group) sees
// them once the grade is back, beside the grade and feedback.

const MAX_NOTES = 200;

async function load(submissionId: string, user: SessionUser) {
  const sub = await prisma.assignmentSubmission.findUnique({ where: { id: submissionId }, select: { id: true, studentId: true, groupId: true, status: true, postedAt: true, text: true, assignmentId: true, assignment: { select: { courseId: true } } } });
  const a = sub ? await courseAccess(sub.assignment.courseId, user) : null;
  if (!sub || !a) throw new NotFoundException('Submission not found.');
  return { sub, canGrade: a.canGrade };
}

/** GET /api/assignments/submissions/:sid/notes — the teaching team always; the student once graded. */
export async function notesFor(submissionId: string, user: SessionUser) {
  const { sub, canGrade } = await load(submissionId, user);
  if (!canGrade) {
    const mine = sub.studentId === user.id || (!!sub.groupId && !!(await prisma.assignmentGroupMember.findFirst({ where: { groupId: sub.groupId, studentId: user.id }, select: { id: true } })));
    if (!mine) throw new NotFoundException('Submission not found.');
    if ((sub.status !== 'RETURNED' && sub.status !== 'REOPENED') || !sub.postedAt) return { notes: [], canEdit: false };
  }
  const notes = await prisma.submissionNote.findMany({ where: { submissionId }, orderBy: { createdAt: 'asc' }, take: MAX_NOTES, select: { id: true, anchor: true, comment: true, createdAt: true, author: { select: { id: true, name: true } } } });
  return { canEdit: canGrade, notes: notes.map((n) => ({ ...n, anchor: JSON.parse(n.anchor) as Anchor })) };
}

/**
 * POST /api/assignments/submissions/:sid/notes (the teaching team):
 * add { anchor, comment } · edit { noteId, comment } · delete { noteId }.
 */
export async function changeNotes(submissionId: string, user: SessionUser, b: Record<string, unknown>) {
  const { sub, canGrade } = await load(submissionId, user);
  if (!canGrade) throw new ForbiddenException('Only the course’s teaching team can add notes.');
  const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 1000) : '';
  const note = async () => {
    const n = typeof b.noteId === 'string' ? await prisma.submissionNote.findFirst({ where: { id: b.noteId, submissionId }, select: { id: true } }) : null;
    if (!n) throw new NotFoundException('That note isn’t there any more.');
    return n;
  };
  switch (b.action) {
    case 'add': {
      const anchor = cleanAnchor(b.anchor, sub.text.length);
      if (!anchor) throw new BadRequestException('Pick a place for the note.');
      if (!comment) throw new BadRequestException('Write the note.');
      if ((await prisma.submissionNote.count({ where: { submissionId } })) >= MAX_NOTES) throw new BadRequestException(`A hand-in can have up to ${MAX_NOTES} notes.`);
      const n = await prisma.submissionNote.create({ data: { submissionId, authorId: user.id, anchor: JSON.stringify(anchor), comment }, select: { id: true } });
      return { id: n.id };
    }
    case 'edit': {
      const n = await note();
      if (!comment) throw new BadRequestException('Write the note.');
      await prisma.submissionNote.update({ where: { id: n.id }, data: { comment } });
      return { ok: true };
    }
    case 'delete': {
      const n = await note();
      await prisma.submissionNote.delete({ where: { id: n.id } });
      return { ok: true };
    }
    default:
      throw new BadRequestException('Unknown action.');
  }
}
