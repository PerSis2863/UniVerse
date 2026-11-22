import { BUILTINS } from './builtins';
import { textOf } from './interp';
import { HELP, SECTIONS, helpFor, lookFor } from './help';

// M391: help, doc and lookfor in the command window (the text is help.ts, shared with the window's browser).

BUILTINS.help = BUILTINS.doc = (a, _n, lab) => {
  const name = a[0] ? textOf(a[0]) : '';
  if (!name) {
    lab.host.out(`Hyperion: ${HELP.size} functions in ${SECTIONS.length} sections.\n\n${SECTIONS.map((s) => `  ${s}: ${[...HELP.values()].filter((e) => e.section === s).slice(0, 6).map((e) => e.name).join(', ')}…`).join('\n')}\n\nType help name for one (help plot), lookfor word to search (lookfor fourier), or open Help ▸ Functions.\n`);
    return [];
  }
  const text = helpFor(name);
  lab.host.out(text ?? (BUILTINS[name] ? `${name} is a function of Hyperion (no help written yet).\n` : `No function called “${name}”. Try lookfor ${name}.\n`));
  return [];
};
BUILTINS.lookfor = (a, _n, lab) => {
  const hits = lookFor(a.map((v) => textOf(v)).join(' '));
  lab.host.out(hits.length ? `${hits.slice(0, 40).map((e) => `  ${e.name.padEnd(14)} ${e.text}`).join('\n')}${hits.length > 40 ? `\n  … ${hits.length - 40} more` : ''}\n` : 'Nothing found.\n');
  return [];
};
