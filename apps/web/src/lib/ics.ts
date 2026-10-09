// Calendar files (.ics) people can add to Google Calendar, Outlook or Apple Calendar.

/** Saves `content` (an iCalendar text) as a file named `name`. */
export function downloadIcs(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
