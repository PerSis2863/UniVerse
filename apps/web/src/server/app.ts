import { Router } from './router';
import auth from './modules/auth';
import users from './modules/users';
import courses from './modules/courses';
import attendance from './modules/attendance';
import grades from './modules/grades';
import quizzes from './modules/quizzes';
import announcements from './modules/announcements';
import files from './modules/files';
import notifications from './modules/notifications';
import knowledgeHub from './modules/knowledge-hub';
import messages from './modules/messages';
import career from './modules/career';
import schedule from './modules/schedule';
import associations from './modules/associations';
import rooms from './modules/rooms';
import tickets from './modules/tickets';
import timetable from './modules/timetable';
import internships from './modules/internships';
import electives from './modules/electives';
import skills from './modules/skills';
import groups from './modules/groups';
import impact from './modules/impact';
import partners from './modules/partners';
import documents from './modules/documents';
import scholarships from './modules/scholarships';
import consents from './modules/consents';
import medical from './modules/medical';
import safety from './modules/safety';
import mentorship from './modules/mentorship';
import collaborations from './modules/collaborations';
import calendar from './modules/calendar';
import health from './modules/health';
import dashboard from './modules/dashboard';
import blackboard from './modules/blackboard';
import audit from './modules/audit';
import applications from './modules/applications';
import owner from './modules/owner';
import ownerChats from './modules/owner-chats';
import activity from './modules/activity';

// The platform API (formerly a NestJS app on Render), served at /api/core/*. Modules are
// registered in the old AppModule's order. Not ported: the Clerk webhook (the app signs in with
// Firebase) and the socket.io chat gateway (the web chat uses /api/chat).
export const api = new Router();
for (const register of [
  auth, users, courses, attendance, grades, quizzes, announcements, files, notifications, knowledgeHub,
  messages, career, schedule, associations, rooms, tickets, timetable, internships, electives, skills,
  groups, impact, partners, documents, scholarships, consents, medical, safety, mentorship, collaborations,
  calendar, health, dashboard, blackboard, audit, applications, owner, ownerChats, activity,
]) {
  register(api);
}
