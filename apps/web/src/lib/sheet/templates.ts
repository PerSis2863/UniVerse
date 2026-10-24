import type { BookJSON, CellJSON } from './book';
import type { Style } from './format';
import { keyOf } from './refs';

// Ready-made spreadsheets (Office suite): a new spreadsheet can start from one of these. Each is
// plain data (book.ts) with working formulas. Import-free.

export interface SheetTemplate { id: string; name: string; hint: string; book: () => BookJSON }

const HEAD: Style = { b: true, bg: '#e2e6e6', bd: { b: 1 } };
const TITLE: Style = { b: true, size: 16 };

/** Rows of values from (r0, c0), with optional styles per row. */
function rows(start: [number, number], data: (string | null)[][], style?: (r: number, c: number) => Style | undefined): Record<string, CellJSON> {
  const out: Record<string, CellJSON> = {};
  data.forEach((row, i) => row.forEach((v, j) => {
    const s = style?.(i, j);
    if (v == null && !s) return;
    out[keyOf(start[0] + i, start[1] + j)] = s ? { v: v ?? '', s } : { v: v ?? '' };
  }));
  return out;
}

export const SHEET_TEMPLATES: SheetTemplate[] = [
  {
    id: 'budget', name: 'Budget', hint: 'Money in and out by month, with totals',
    book: () => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      const items = [['Income', 'Pocket money', '50'], ['Income', 'Part-time job', '120'], ['Spending', 'Food', '60'], ['Spending', 'Travel', '25'], ['Spending', 'Phone', '15'], ['Spending', 'Fun', '30']];
      const money: Style = { fmt: 'currency', dp: 0 };
      const cells: Record<string, CellJSON> = {
        A1: { v: 'Budget', s: TITLE },
        ...rows([2, 0], [['Type', 'Item', ...months, 'Total']], () => HEAD),
        ...rows([3, 0], items.map(([t, n, v]) => [t, n, ...months.map(() => v), null]), (_, c) => (c >= 2 ? money : undefined)),
      };
      items.forEach((_, i) => { cells[keyOf(3 + i, 8)] = { v: `=SUM(C${4 + i}:H${4 + i})`, s: { ...money, b: true } }; });
      const last = 3 + items.length;
      // The summary (its own header row, so a chart of it gets the months).
      const head = last + 1;
      Object.assign(cells, rows([head, 1], [['Summary', ...months, 'Total']], () => HEAD));
      const labels = ['Money in', 'Money out', 'Left over'];
      labels.forEach((l, i) => { cells[keyOf(head + 1 + i, 1)] = { v: l, s: { b: true, ...(i === 2 ? { bd: { t: 1 } } : {}) } }; });
      for (let c = 2; c <= 8; c++) {
        const col = String.fromCharCode(65 + c);
        cells[keyOf(head + 1, c)] = { v: `=SUMIF($A$4:$A$${last},"Income",${col}4:${col}${last})`, s: money };
        cells[keyOf(head + 2, c)] = { v: `=SUMIF($A$4:$A$${last},"Spending",${col}4:${col}${last})`, s: money };
        cells[keyOf(head + 3, c)] = { v: `=${col}${head + 2}-${col}${head + 3}`, s: { ...money, b: true, bd: { t: 1 } } };
      }
      const leftRow = head + 4;
      return { sheets: [{ id: 's1', name: 'Budget', cells, cols: { 0: 90, 1: 140 }, freeze: { r: 3, c: 2 }, rules: [{ id: 'r1', area: `C${leftRow}:I${leftRow}`, kind: 'lt', a: '0', color: '#b91c1c', bg: '#fee2e2' }], charts: [{ id: 'c1', type: 'column', area: `B${head + 1}:H${head + 3}`, title: 'Money in and out' }] }] };
    },
  },
  {
    id: 'gradebook', name: 'Gradebook', hint: 'Marks per test, average and letter grade',
    book: () => {
      const students = ['Aarav', 'Bea', 'Chen', 'Dina', 'Eli', 'Farah'];
      const marks = [[78, 85, 90], [62, 70, 58], [91, 88, 95], [55, 61, 49], [84, 79, 88], [70, 74, 81]];
      const cells: Record<string, CellJSON> = {
        A1: { v: 'Gradebook', s: TITLE },
        ...rows([2, 0], [['Student', 'Test 1', 'Test 2', 'Test 3', 'Average', 'Grade', 'Passed']], () => HEAD),
        ...rows([3, 0], students.map((n, i) => [n, ...marks[i].map(String)])),
      };
      students.forEach((_, i) => {
        const r = 4 + i;
        cells[keyOf(r - 1, 4)] = { v: `=ROUND(AVERAGE(B${r}:D${r}),1)`, s: { b: true } };
        cells[keyOf(r - 1, 5)] = { v: `=IFS(E${r}>=90,"A",E${r}>=80,"B",E${r}>=70,"C",E${r}>=60,"D",TRUE,"F")`, s: { align: 'center' } };
        cells[keyOf(r - 1, 6)] = { v: `=E${r}>=60`, s: { align: 'center' } };
      });
      const end = 3 + students.length;
      cells[keyOf(end + 1, 0)] = { v: 'Class average', s: { b: true } };
      for (let c = 1; c <= 4; c++) { const col = String.fromCharCode(65 + c); cells[keyOf(end + 1, c)] = { v: `=ROUND(AVERAGE(${col}4:${col}${end}),1)`, s: { b: true, bd: { t: 1 } } }; }
      cells[keyOf(end + 2, 0)] = { v: 'Highest' };
      cells[keyOf(end + 3, 0)] = { v: 'Lowest' };
      for (let c = 1; c <= 4; c++) { const col = String.fromCharCode(65 + c); cells[keyOf(end + 2, c)] = { v: `=MAX(${col}4:${col}${end})` }; cells[keyOf(end + 3, c)] = { v: `=MIN(${col}4:${col}${end})` }; }
      return { sheets: [{ id: 's1', name: 'Marks', cells, cols: { 0: 130 }, freeze: { r: 3, c: 1 }, rules: [{ id: 'r1', area: `E4:E${end}`, kind: 'scale' }, { id: 'r2', area: `B4:D${end}`, kind: 'lt', a: '60', color: '#b91c1c' }], charts: [{ id: 'c1', type: 'column', area: `A3:D${end}`, title: 'Marks by student' }] }] };
    },
  },
  {
    id: 'attendance', name: 'Attendance register', hint: 'P, A or L per day, with totals',
    book: () => {
      const names = ['Aarav', 'Bea', 'Chen', 'Dina', 'Eli'];
      const days = Array.from({ length: 10 }, (_, i) => `Day ${i + 1}`);
      const cells: Record<string, CellJSON> = {
        A1: { v: 'Attendance', s: TITLE },
        A2: { v: 'P = present, A = absent, L = late', s: { i: true, color: '#4a5c6a' } },
        ...rows([3, 0], [['Student', ...days, 'Present', 'Absent', 'Late', '%']], () => ({ ...HEAD, align: 'center' })),
        ...rows([4, 0], names.map((n) => [n, ...days.map(() => 'P')]), (_, c) => (c > 0 ? { align: 'center' } : undefined)),
      };
      const lastDay = String.fromCharCode(65 + days.length);
      names.forEach((_, i) => {
        const r = 5 + i;
        cells[keyOf(r - 1, days.length + 1)] = { v: `=COUNTIF(B${r}:${lastDay}${r},"P")` };
        cells[keyOf(r - 1, days.length + 2)] = { v: `=COUNTIF(B${r}:${lastDay}${r},"A")` };
        cells[keyOf(r - 1, days.length + 3)] = { v: `=COUNTIF(B${r}:${lastDay}${r},"L")` };
        cells[keyOf(r - 1, days.length + 4)] = { v: `=(${String.fromCharCode(66 + days.length)}${r}+${String.fromCharCode(68 + days.length)}${r})/COUNTA(B${r}:${lastDay}${r})`, s: { fmt: 'percent', dp: 0, b: true } };
      });
      const end = 4 + names.length;
      return { sheets: [{ id: 's1', name: 'Register', cells, cols: { 0: 120 }, freeze: { r: 4, c: 1 },
        checks: [{ id: 'v1', area: `B5:${lastDay}${end}`, kind: 'list', list: ['P', 'A', 'L'] }],
        rules: [{ id: 'r1', area: `B5:${lastDay}${end}`, kind: 'eq', a: 'A', bg: '#fee2e2', color: '#b91c1c' }, { id: 'r2', area: `B5:${lastDay}${end}`, kind: 'eq', a: 'L', bg: '#fef3c7', color: '#92400e' }, { id: 'r3', area: `${String.fromCharCode(69 + days.length)}5:${String.fromCharCode(69 + days.length)}${end}`, kind: 'lt', a: '0.9', color: '#b91c1c' }] }] };
    },
  },
  {
    id: 'timetable', name: 'Timetable', hint: 'A week of lessons',
    book: () => {
      const times = ['8:30', '9:30', '10:30', '11:30', '12:30', '13:30', '14:30'];
      const cells: Record<string, CellJSON> = {
        A1: { v: 'My timetable', s: TITLE },
        ...rows([2, 0], [['Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']], () => ({ ...HEAD, align: 'center' })),
        ...rows([3, 0], times.map((t, i) => [t, ...(i === 4 ? ['Lunch', 'Lunch', 'Lunch', 'Lunch', 'Lunch'] : ['', '', '', '', ''])]), (r, c) => (c === 0 ? { b: true, fmt: 'time' } : r === 4 ? { align: 'center', i: true, bg: '#eef1f2' } : { align: 'center', wrap: true })),
      };
      return { sheets: [{ id: 's1', name: 'Week', cells, cols: { 0: 70, 1: 120, 2: 120, 3: 120, 4: 120, 5: 120 }, rows: Object.fromEntries(times.map((_, i) => [3 + i, 44])), freeze: { r: 3, c: 1 } }] };
    },
  },
  {
    id: 'tracker', name: 'Project tracker', hint: 'Tasks, who, status and due dates',
    book: () => {
      const tasks = [['Plan the project', 'Ana', 'Done', '2026-10-20'], ['Research', 'Ben', 'Doing', '2026-10-27'], ['Write the report', 'Ana', 'To do', '2026-11-03'], ['Make the slides', 'Cleo', 'To do', '2026-11-05'], ['Practise the talk', 'Everyone', 'To do', '2026-11-08']];
      const cells: Record<string, CellJSON> = {
        A1: { v: 'Project tracker', s: TITLE },
        ...rows([2, 0], [['Task', 'Who', 'Status', 'Due', 'Days left']], () => HEAD),
        ...rows([3, 0], tasks, (_, c) => (c === 3 ? { fmt: 'date' } : undefined)),
      };
      tasks.forEach((_, i) => { const r = 4 + i; cells[keyOf(r - 1, 4)] = { v: `=IF(C${r}="Done","",D${r}-TODAY())` }; });
      const end = 3 + tasks.length;
      cells[keyOf(end + 1, 0)] = { v: 'Done', s: { b: true } };
      cells[keyOf(end + 1, 1)] = { v: `=COUNTIF(C4:C${end},"Done")&" of "&COUNTA(A4:A${end})` };
      return { sheets: [{ id: 's1', name: 'Tasks', cells, cols: { 0: 200, 1: 100, 2: 90, 3: 110 }, freeze: { r: 3, c: 0 },
        checks: [{ id: 'v1', area: `C4:C${end + 20}`, kind: 'list', list: ['To do', 'Doing', 'Done'] }, { id: 'v2', area: `D4:D${end + 20}`, kind: 'date' }],
        rules: [{ id: 'r1', area: `C4:C${end + 20}`, kind: 'eq', a: 'Done', bg: '#dcfce7', color: '#166534' }, { id: 'r2', area: `C4:C${end + 20}`, kind: 'eq', a: 'Doing', bg: '#e0f2fe', color: '#075985' }, { id: 'r3', area: `E4:E${end + 20}`, kind: 'lt', a: '0', color: '#b91c1c' }],
        filter: { area: `A3:E${end}`, hide: {} } }] };
    },
  },
];

export const sheetTemplateById = (id: string | null | undefined) => SHEET_TEMPLATES.find((t) => t.id === id) ?? null;
