export function toggleCheckbox(content: string, index: number): string {
  const regex = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]/gm;
  let count = 0;
  return content.replace(regex, (match, prefix, check) => {
    if (count++ === index) {
      return `${prefix}[${check === " " ? "x" : " "}]`;
    }
    return match;
  });
}
