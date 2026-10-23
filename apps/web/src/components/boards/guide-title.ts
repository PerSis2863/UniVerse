// The owner's "UniVerse explained" whiteboard (owner console → Explain UniVerse; universe-guide.ts
// draws it). Its own small file so the boards list and the console can name it without loading the
// whole board.
export const GUIDE_TITLE = 'UniVerse explained';
/** Opening it always asks for the guide template: it only fills in a board that is still empty. */
export const guideHref = (id: string) => `/boards/${id}?template=guide`;
