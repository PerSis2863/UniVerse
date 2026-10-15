import { NextResponse } from 'next/server';
import { route } from '@/server/assignments';
import { courseCalendar, courseCalendarIcs } from '@/server/ical';
import { NotFoundException } from '@/server/http';

// A course's calendar (Stage 5 · B2): due dates, events, class calls and weekly classes.
// ?format=ics gives the same as a file to add to a calendar app.

type Ctx = { params: Promise<{ id: string }> };

export const GET = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    const cal = await courseCalendar((await params).id, user);
    if (!cal) throw new NotFoundException('Course not found.');
    if (new URL(req.url).searchParams.get('format') !== 'ics') return cal;
    const name = `${cal.course.code.replace(/[^A-Za-z0-9_-]/g, '_') || 'course'}-calendar.ics`;
    return new NextResponse(courseCalendarIcs(cal), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
  });
