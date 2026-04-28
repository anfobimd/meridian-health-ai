// Dotphrase trigger detection and expansion utilities.
//
// Test cases:
// - detectTriggerAtCursor("hello .bp", 9) => { trigger: ".bp", startIndex: 6, endIndex: 9 }
// - detectTriggerAtCursor("hello.bp", 8) => null (no whitespace before the dot)
// - detectTriggerAtCursor(".bp", 3) => { trigger: ".bp", startIndex: 0, endIndex: 3 }
// - detectTriggerAtCursor("hello .b", 8) => { trigger: ".b", startIndex: 6, endIndex: 8 }
// - detectTriggerAtCursor("hello", 5) => null (no dot)
// - detectTriggerAtCursor("hello .", 7) => null (just a dot, no letters after)
// - detectTriggerAtCursor("hello .Bp", 9) => null (uppercase letters not allowed)

export type TriggerMatch = {
  trigger: string;
  startIndex: number;
  endIndex: number;
};

export function detectTriggerAtCursor(
  text: string,
  cursorIndex: number
): TriggerMatch | null {
  if (cursorIndex <= 0 || cursorIndex > text.length) return null;

  // Scan backward from the cursor for up to 30 trigger body chars.
  let i = cursorIndex - 1;
  const minDotIndex = Math.max(0, cursorIndex - 1 - 30);
  while (i >= minDotIndex) {
    const ch = text[i];
    if (ch === ".") {
      const bodyLen = cursorIndex - i - 1;
      if (bodyLen < 1 || bodyLen > 30) return null;
      const precededOk = i === 0 || /\s/.test(text[i - 1]);
      if (!precededOk) return null;
      return {
        trigger: text.slice(i, cursorIndex),
        startIndex: i,
        endIndex: cursorIndex,
      };
    }
    if (!/[a-z0-9_]/.test(ch)) return null;
    i--;
  }
  return null;
}

export function replaceTrigger(
  text: string,
  match: TriggerMatch,
  replacement: string
): { text: string; cursorIndex: number } {
  const newText =
    text.slice(0, match.startIndex) + replacement + text.slice(match.endIndex);
  return {
    text: newText,
    cursorIndex: match.startIndex + replacement.length,
  };
}