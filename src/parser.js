import { lex } from "./lexer.js";
import { fault } from "./errors.js";

const precedence = new Map([
  ["or", 1],
  ["and", 2],
  ["==", 3],
  ["!=", 3],
  ["<", 4],
  ["<=", 4],
  [">", 4],
  [">=", 4],
  ["+", 5],
  ["-", 5],
  ["*", 6],
  ["/", 6],
  ["%", 6],
]);

export function parse(source) {
  const tokens = lex(source);
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  function expect(kind) {
    const x = peek();
    if (x.kind !== kind)
      fault("parse", "expected '" + kind + "', found '" + x.kind + "'", x);
    return take();
  }
  function accept(kind) {
    if (peek().kind === kind) {
      take();
      return true;
    }
    return false;
  }
  function sequence(end, read) {
    const list = [];
    if (!accept(end)) {
      do {
        list.push(read());
      } while (accept(","));
      expect(end);
    }
    return list;
  }
  function block() {
    expect("{");
    const body = [];
    while (!accept("}")) {
      if (peek().kind === "eof") fault("parse", "unclosed block", peek());
      body.push(statement());
    }
    return body;
  }
  function fun(point, name) {
    expect("(");
    const params = sequence(")", () => expect("name"));
    return { kind: "fun", point, name, params, body: block() };
  }
  function prefix() {
    const p = take();
    switch (p.kind) {
      case "integer":
      case "string":
        return { kind: "literal", point: p, value: p.value };
      case "true":
      case "false":
      case "nil":
        return {
          kind: "literal",
          point: p,
          value: p.kind === "nil" ? null : p.kind === "true",
        };
      case "name":
        return { kind: "read", point: p, name: p.value };
      case "[":
        return { kind: "vector", point: p, items: sequence("]", expr) };
      case "(": {
        const value = expr();
        expect(")");
        return value;
      }
      case "-":
      case "!":
        return { kind: "unary", point: p, op: p.kind, value: expr(7) };
      case "fn":
        return fun(p, "<lambda>");
      default:
        fault("parse", "expected an expression, found '" + p.kind + "'", p);
    }
  }
  function expr(min = 1) {
    let left = prefix();
    for (;;) {
      const p = peek();
      if (accept("(")) {
        left = {
          kind: "call",
          point: p,
          target: left,
          args: sequence(")", expr),
        };
        continue;
      }
      const power = precedence.get(p.kind);
      if (power === undefined || power < min) return left;
      take();
      left = {
        kind: "binary",
        point: p,
        op: p.kind,
        left,
        right: expr(power + 1),
      };
    }
  }
  function statement() {
    const p = peek(),
      kind = p.kind;
    if (accept("let")) {
      const name = expect("name").value;
      expect("=");
      const value = expr();
      expect(";");
      return { kind, point: p, name, value };
    }
    if (kind === "fn" && tokens[index + 1]?.kind === "name") {
      take();
      const name = take().value;
      return { kind: "named", point: p, name, value: fun(p, name) };
    }
    if (accept("if")) {
      const test = expr(),
        yes = block(),
        no = accept("else") ? block() : [];
      return { kind, point: p, test, yes, no };
    }
    if (accept("while")) return { kind, point: p, test: expr(), body: block() };
    if (kind === "{") return { kind: "block", point: p, body: block() };
    if (kind === "break" || kind === "continue") {
      take();
      expect(";");
      return { kind, point: p };
    }
    if (kind === "print" || kind === "return") {
      take();
      const value =
        kind === "return" && peek().kind === ";"
          ? { kind: "literal", point: p, value: null }
          : expr();
      expect(";");
      return { kind, point: p, value };
    }
    if (kind === "name" && tokens[index + 1]?.kind === "=") {
      take();
      take();
      const value = expr();
      expect(";");
      return { kind: "assign", point: p, name: p.value, value };
    }
    const value = expr();
    expect(";");
    return { kind: "discard", point: p, value };
  }
  const body = [];
  while (peek().kind !== "eof") body.push(statement());
  return { kind: "program", point: { line: 1, column: 1 }, body };
}
