import type { Router } from '../router';
import { DashboardService } from '../services/dashboard.service';

const dashboard = new DashboardService();

export default function dashboardModule(router: Router) {
  const r = router.controller('dashboard');

  r.get('student', { roles: ['STUDENT'] }, ({ user }) => dashboard.getStudentDashboard(user));
  r.get('teacher', { roles: ['TEACHER'] }, ({ user }) => dashboard.getTeacherDashboard(user));
  r.get('admin', { roles: ['ADMIN'] }, () => dashboard.getAdminDashboard());
}
