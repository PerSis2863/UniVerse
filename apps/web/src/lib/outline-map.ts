// Outline → mind map (M17, whiteboards → Add → From text): an indented list, or one with "-" bullets,
// becomes a centre, its branches and their ideas (deeper lines join their branch's ideas).

export interface OutlineMap { center: string; branches: { label: string; ideas: string[] }[] }

export function outlineToMap(text: string, maxBranches = 12, maxIdeas = 8): OutlineMap | null {
  const rows = text.split('\n')
    .map((raw) => { const m = /^(\s*)(?:[-*•]|\d+[.)])?\s*(.*)$/.exec(raw.replace(/\t/g, '  '))!; return { depth: m[1].length, text: m[2].trim().slice(0, 80) }; })
    .filter((r) => r.text);
  if (!rows.length) return null;
  const [top, ...rest] = rows;
  if (!rest.length) return { center: top.text, branches: [] };
  // Branches are the shallowest lines under the centre (or every line, if all sit at one depth).
  const branchDepth = Math.min(...rest.map((r) => r.depth));
  const branches: OutlineMap['branches'] = [];
  for (const r of rest) {
    if (r.depth <= branchDepth || !branches.length) { if (branches.length < maxBranches) branches.push({ label: r.text, ideas: [] }); continue; }
    const b = branches[branches.length - 1];
    if (b.ideas.length < maxIdeas) b.ideas.push(r.text);
  }
  return { center: top.text, branches };
}
