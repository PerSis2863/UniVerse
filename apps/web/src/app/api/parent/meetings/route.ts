import { route } from '@/server/assignments';
import { bookMeeting, parentMeetings } from '@/server/parent-meetings';

// Parent–teacher meetings, parent side (Stage 5 · B16.3; src/server/parent-meetings.ts).
// GET ?studentId=: my meetings and the child's teachers; &teacherId=: that teacher's free times. POST { meetingId, studentId, topic?, timeZone }: book one.
export const GET = (req: Request) => route(req, (user) => {
  const q = new URL(req.url).searchParams;
  return parentMeetings(user, q.get('studentId'), q.get('teacherId'));
});
export const POST = (req: Request) => route(req, async (user) => bookMeeting(user, await req.json().catch(() => ({}))));
