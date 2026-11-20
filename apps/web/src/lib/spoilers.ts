/** M344: ||spoiler|| text covered in previews and notifications (the message itself uncovers it on a tap). */
export const hideSpoilers = (text: string) => text.replace(/\|\|[^|\n]+?\|\|/g, '▒▒▒▒');
