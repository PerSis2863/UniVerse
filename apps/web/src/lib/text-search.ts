// Words for searching text (the course tutor's passages, "Ask your semester"): lower case, accents
// and the most common English and French words dropped.

const STOP = new Set('the a an and or of to in on for is are was were be by with as at from that this it its what which who how why when where do does did can could should would will i you we they he she me my your our their about into than then there these those not no yes le la les un une des et ou de du en est sont pour par avec que qui quoi comment pourquoi dans sur ce cette'.split(' '));
/** The searchable words of a text (lower case, accents and common words dropped). */
export const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{2,}/g)?.filter((w) => !STOP.has(w)) ?? [];
