// legal/*.md files are bundled as text (see next.config.ts).
declare module '*.md' {
  const text: string;
  export default text;
}
