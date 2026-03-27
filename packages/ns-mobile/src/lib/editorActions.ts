interface EditorResult {
  text: string;
  selection: { start: number; end: number };
}

export function toggleBold(
  text: string,
  start: number,
  end: number,
): EditorResult {
  return toggleWrap(text, start, end, "**");
}

export function toggleItalic(
  text: string,
  start: number,
  end: number,
): EditorResult {
  return toggleWrap(text, start, end, "*");
}

export function insertHeading(
  text: string,
  start: number,
  end: number,
): EditorResult {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end);
  const actualEnd = lineEnd === -1 ? text.length : lineEnd;
  const line = text.slice(lineStart, actualEnd);

  const match = line.match(/^(#{1,6})\s/);
  let newLine: string;
  if (match) {
    if (match[1].length >= 6) {
      newLine = line.replace(/^#{1,6}\s/, "");
    } else {
      newLine = "#" + line;
    }
  } else {
    newLine = "# " + line;
  }

  const newText = text.slice(0, lineStart) + newLine + text.slice(actualEnd);
  const cursorPos = lineStart + newLine.length;
  return { text: newText, selection: { start: cursorPos, end: cursorPos } };
}

export function insertLink(
  text: string,
  start: number,
  end: number,
): EditorResult {
  const selected = text.slice(start, end);
  if (selected) {
    const inserted = `[${selected}](url)`;
    const newText = text.slice(0, start) + inserted + text.slice(end);
    const urlStart = start + selected.length + 2;
    return {
      text: newText,
      selection: { start: urlStart, end: urlStart + 3 },
    };
  }
  const inserted = "[link](url)";
  const newText = text.slice(0, start) + inserted + text.slice(end);
  const linkStart = start + 1;
  return {
    text: newText,
    selection: { start: linkStart, end: linkStart + 4 },
  };
}

export function insertList(
  text: string,
  start: number,
  end: number,
): EditorResult {
  return insertAtLineStart(text, start, end, "- ");
}

export function insertCheckbox(
  text: string,
  start: number,
  end: number,
): EditorResult {
  return insertAtLineStart(text, start, end, "- [ ] ");
}

export function insertCode(
  text: string,
  start: number,
  end: number,
): EditorResult {
  const selected = text.slice(start, end);
  if (selected.includes("\n")) {
    const wrapped = "```\n" + selected + "\n```";
    const newText = text.slice(0, start) + wrapped + text.slice(end);
    const cursorEnd = start + wrapped.length - 3;
    return { text: newText, selection: { start: start + 4, end: cursorEnd } };
  }
  return toggleWrap(text, start, end, "`");
}

export function insertQuote(
  text: string,
  start: number,
  end: number,
): EditorResult {
  return insertAtLineStart(text, start, end, "> ");
}

function toggleWrap(
  text: string,
  start: number,
  end: number,
  marker: string,
): EditorResult {
  const len = marker.length;
  const before = text.slice(start - len, start);
  const after = text.slice(end, end + len);

  if (before === marker && after === marker) {
    const newText =
      text.slice(0, start - len) + text.slice(start, end) + text.slice(end + len);
    return {
      text: newText,
      selection: { start: start - len, end: end - len },
    };
  }

  const selected = text.slice(start, end);
  const wrapped = marker + selected + marker;
  const newText = text.slice(0, start) + wrapped + text.slice(end);
  return {
    text: newText,
    selection: { start: start + len, end: end + len },
  };
}

function insertAtLineStart(
  text: string,
  start: number,
  end: number,
  prefix: string,
): EditorResult {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const linePrefix = text.slice(lineStart, lineStart + prefix.length);

  if (linePrefix === prefix) {
    const newText =
      text.slice(0, lineStart) + text.slice(lineStart + prefix.length);
    return {
      text: newText,
      selection: {
        start: Math.max(lineStart, start - prefix.length),
        end: Math.max(lineStart, end - prefix.length),
      },
    };
  }

  const newText = text.slice(0, lineStart) + prefix + text.slice(lineStart);
  return {
    text: newText,
    selection: {
      start: start + prefix.length,
      end: end + prefix.length,
    },
  };
}
