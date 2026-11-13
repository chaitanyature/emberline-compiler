import { fault } from "./errors.js";

const words = new Set(
  "let fn return print if else while break continue true false nil and or".split(
    " ",
  ),
);
const pairOps = new Set(["==", "!=", "<=", ">="]);
const single = new Set("+-*/%(){}[],;=<>!".split(""));

export function lex(source) {
  let i = 0,
    line = 1,
    column = 1;
  const tokens = [];
  function advance() {
    const c = source[i++];
    if (c === "\n") {
      line++;
      column = 1;
    } else column++;
    return c;
  }
  while (i < source.length) {
    const start = i,
      point = { line, column };
    const c = advance();
    const token = (kind, value = source.slice(start, i)) =>
      tokens.push({ kind, value, ...point });
    if (/\s/.test(c)) continue;
    if (c === "/" && source[i] === "/") {
      while (i < source.length && source[i] !== "\n") advance();
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      while (i < source.length && /[A-Za-z_0-9]/.test(source[i])) advance();
      const word = source.slice(start, i);
      token(words.has(word) ? word : "name");
      continue;
    }
    if (/\d/.test(c)) {
      while (i < source.length && /\d/.test(source[i])) advance();
      const n = Number(source.slice(start, i));
      if (!Number.isSafeInteger(n))
        fault("lex", "integer literal exceeds safe range", point);
      token("integer", n);
      continue;
    }
    if (c === '"') {
      let closed = false;
      while (i < source.length) {
        const ch = advance();
        if (ch === '"') {
          closed = true;
          break;
        }
        if (ch === "\n") break;
        if (ch === "\\" && i < source.length) advance();
      }
      if (!closed) fault("lex", "unterminated string literal", point);
      try {
        token("string", JSON.parse(source.slice(start, i)));
      } catch {
        fault("lex", "invalid JSON string escape", point);
      }
      continue;
    }
    const pair = c + (source[i] ?? "");
    if (pairOps.has(pair)) {
      advance();
      token(pair);
      continue;
    }
    if (single.has(c)) {
      token(c);
      continue;
    }
    fault("lex", "unexpected character " + JSON.stringify(c), point);
  }
  tokens.push({ kind: "eof", value: "", line, column });
  return tokens;
}
