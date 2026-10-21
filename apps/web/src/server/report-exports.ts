import prisma from '@/lib/db';

// The data exports of Admin → Reports (Pro): every account, the impact points ledger and NGO
// applications, as CSV. Downloaded from /api/premium/export, or saved to an admin's My files on a
// schedule (report-schedules.ts, Phase E).

// Escapes a CSV cell, and neutralises leading = + - @ so spreadsheet apps don't run it as a formula.
function cell(value: unknown): string {
  let s = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export const ROLES = ['STUDENT', 'TEACHER', 'ADMIN', 'INDUSTRY_MENTOR', 'GUARDIAN'] as const;
export const STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED'] as const;
type MemberFilter = { role?: (typeof ROLES)[number]; status?: (typeof STATUSES)[number]; q?: string };

/** Optional filters for the members export: ?role=TEACHER&status=ACTIVE&q=smith (name, email or phone). */
export function memberFilter(params: URLSearchParams): MemberFilter {
  const role = params.get('role')?.toUpperCase();
  const status = params.get('status')?.toUpperCase();
  const q = params.get('q')?.trim().slice(0, 100);
  return {
    role: (ROLES as readonly string[]).includes(role ?? '') ? (role as MemberFilter['role']) : undefined,
    status: (STATUSES as readonly string[]).includes(status ?? '') ? (status as MemberFilter['status']) : undefined,
    q: q || undefined,
  };
}

export function memberWhere(f: MemberFilter) {
  return {
    ...(f.role ? { role: f.role } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q } }, { email: { contains: f.q.toLowerCase() } }, { phone: { contains: f.q } }] } : {}),
  };
}

export const MEMBER_SELECT = {
  id: true, name: true, email: true, phone: true, role: true, status: true, accountType: true,
  impactLevel: true, impactXP: true, lastSeenAt: true, createdAt: true,
  studentProfile: { select: { department: true, year: true, gpa: true } },
  teacherProfile: { select: { department: true, designation: true } },
} as const;

// Each export is one SQL query with its joins: Prisma would load each relation in more queries of
// ~98 ids at a time, and a school of a few thousand would pass D1's 50 queries in one run (which
// also stopped the daily jobs that save scheduled exports).
const q = <T,>(sql: string, ...args: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...args);
/** A stored date (D1 keeps text) as a date, so the file shows it like the others. */
const when = (v: unknown) => (v ? new Date(String(v)) : '');

type MemberRow = { name: string; email: string; phone: string | null; role: string; status: string; accountType: string | null; impactLevel: number; impactXP: number; lastSeenAt: string | null; createdAt: string; sDept: string | null; year: number | null; gpa: number | null; tDept: string | null; designation: string | null };

export const EXPORTS = {
  members: async (params: URLSearchParams) => {
    const f = memberFilter(params);
    const like = f.q ? `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
    const users = await q<MemberRow>(
      `SELECT u.name, u.email, u.phone, u.role, u.status, u.accountType, u.impactLevel, u.impactXP, u.lastSeenAt, u.createdAt,
              sp.department AS sDept, sp.year, sp.gpa, tp.department AS tDept, tp.designation
         FROM users u LEFT JOIN student_profiles sp ON sp.userId = u.id LEFT JOIN teacher_profiles tp ON tp.userId = u.id
        WHERE (? IS NULL OR u.role = ?) AND (? IS NULL OR u.status = ?)
          AND (? IS NULL OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE lower(?) ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')
        ORDER BY u.createdAt ASC LIMIT 20000`,
      f.role ?? null, f.role ?? null, f.status ?? null, f.status ?? null, like, like, like, like,
    );
    return toCsv(
      ['Name', 'Email', 'Phone', 'Role', 'Status', 'Account type', 'Department', 'Year', 'GPA', 'Designation', 'Impact level', 'Impact XP', 'Last active', 'Joined'],
      users.map((u) => [
        u.name, u.email, u.phone ?? '', u.role, u.status, u.accountType ?? '',
        u.sDept ?? u.tDept ?? '', u.year ?? '', u.gpa && Number(u.gpa) > 0 ? Number(u.gpa) : '', u.designation ?? '',
        u.impactLevel, u.impactXP, u.lastSeenAt ? when(u.lastSeenAt) : 'Never', when(u.createdAt),
      ]),
    );
  },
  impact: async () => {
    const points = await q<{ name: string; email: string; phone: string | null; role: string; status: string; points: number; reason: string; sourceType: string; awardedAt: string }>(
      `SELECT u.name, u.email, u.phone, u.role, u.status, p.points, p.reason, p.sourceType, p.awardedAt
         FROM impact_points p JOIN users u ON u.id = p.userId ORDER BY p.awardedAt DESC LIMIT 50000`,
    );
    return toCsv(
      ['Member', 'Email', 'Phone', 'Role', 'Status', 'Points', 'Reason', 'Source', 'Awarded'],
      points.map((p) => [p.name, p.email, p.phone ?? '', p.role, p.status, p.points, p.reason, p.sourceType, when(p.awardedAt)]),
    );
  },
  applications: async () => {
    const apps = await q<{ name: string; email: string; phone: string | null; role: string; userStatus: string; project: string; ngo: string; status: string; appliedAt: string }>(
      `SELECT u.name, u.email, u.phone, u.role, u.status AS userStatus, pr.name AS project, n.name AS ngo, a.status, a.appliedAt
         FROM ngo_project_applications a JOIN users u ON u.id = a.studentId JOIN ngo_projects pr ON pr.id = a.projectId JOIN ngos n ON n.id = pr.ngoId
        ORDER BY a.appliedAt DESC LIMIT 20000`,
    );
    return toCsv(
      ['Student', 'Email', 'Phone', 'Role', 'Account status', 'Project', 'NGO', 'Application status', 'Applied'],
      apps.map((a) => [a.name, a.email, a.phone ?? '', a.role, a.userStatus, a.project, a.ngo, a.status, when(a.appliedAt)]),
    );
  },
};

export type ExportType = keyof typeof EXPORTS;
export const isExportType = (t: unknown): t is ExportType => typeof t === 'string' && Object.hasOwn(EXPORTS, t);
