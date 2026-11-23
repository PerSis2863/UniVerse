// Hyperion's languages (M466–, the owner, 23 Nov: Python, R, Julia, C++ and Rust beside MATLAB). A script's language is
// its file ending. MATLAB runs on Hyperion's own engine; Python (Pyodide, with NumPy, SciPy, Pandas, Matplotlib) and R
// (webR, with ggplot2) run inside the browser, nothing to install; Julia, C++ and Rust run in the computer app with the
// copies installed on the person's computer.

export type LangId = 'matlab' | 'python' | 'r' | 'julia' | 'cpp' | 'rust';
export interface LangInfo { id: LangId; name: string; ext: string; where: 'engine' | 'browser' | 'computer'; comment: string; starter: string }

export const LANGS: LangInfo[] = [
  { id: 'matlab', name: 'MATLAB', ext: '.m', where: 'engine', comment: '%', starter: '% A new script: press Run (or Ctrl+Enter)\n' },
  { id: 'python', name: 'Python', ext: '.py', where: 'browser', comment: '#', starter: "# Python with NumPy, SciPy, Pandas and Matplotlib: press Run (the first run loads Python, about 15 MB)\nimport numpy as np\nimport matplotlib.pyplot as plt\n\nx = np.linspace(0, 2 * np.pi, 200)\nplt.plot(x, np.sin(x))\nplt.title('sin(x)')\nprint(np.round(np.sin(x[:5]), 3))\n" },
  { id: 'r', name: 'R', ext: '.R', where: 'browser', comment: '#', starter: "# R with ggplot2: press Run (the first run loads R, about 20 MB)\nx <- seq(0, 2 * pi, length.out = 200)\nplot(x, sin(x), type = 'l', main = 'sin(x)')\nsummary(sin(x))\n" },
  { id: 'julia', name: 'Julia', ext: '.jl', where: 'computer', comment: '#', starter: '# Julia, run by the copy installed on this computer (in Hyperion\'s computer app)\nx = range(0, 2π, length = 5)\nprintln(round.(sin.(x), digits = 3))\n' },
  { id: 'cpp', name: 'C++', ext: '.cpp', where: 'computer', comment: '//', starter: '// C++, built and run by the compiler on this computer (in Hyperion\'s computer app)\n#include <cmath>\n#include <iostream>\n\nint main() {\n  for (int k = 0; k < 5; ++k) std::cout << std::sin(k * 0.5) << "\\n";\n}\n' },
  { id: 'rust', name: 'Rust', ext: '.rs', where: 'computer', comment: '//', starter: '// Rust, built and run by rustc on this computer (in Hyperion\'s computer app)\nfn main() {\n    for k in 0..5 {\n        println!("{:.3}", (k as f64 * 0.5).sin());\n    }\n}\n' },
];

/** A script's language from its name (an unknown ending is MATLAB, Hyperion's own). */
export function langOf(name: string): LangInfo {
  const lower = name.toLowerCase(), ext = lower.slice(lower.lastIndexOf('.'));
  return LANGS.find((l) => l.ext.toLowerCase() === ext || (l.id === 'cpp' && ['.cc', '.cxx', '.c++'].includes(ext))) ?? LANGS[0];
}

/** A short form of a value for the variables panel: at most n characters on one line. */
export const oneLine = (s: string, n = 60) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** The packages an R script asks for: library(x), require(x), requireNamespace("x"), x::f (R's own left out). */
export function packagesIn(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/\b(?:library|require|requireNamespace)\s*\(\s*["']?([A-Za-z][\w.]*)["']?/g)) out.add(m[1]);
  for (const m of code.matchAll(/\b([A-Za-z][\w.]*):::?[A-Za-z_.]/g)) out.add(m[1]);
  for (const base of ['base', 'stats', 'utils', 'graphics', 'grDevices', 'methods', 'datasets', 'tools', 'grid', 'splines', 'parallel', 'compiler', 'tcltk', 'stats4', 'webr']) out.delete(base);
  return [...out].slice(0, 20);
}
