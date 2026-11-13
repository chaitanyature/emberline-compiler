import { fault } from "./errors.js";

const error = (message) => fault("runtime", message);
export function boolean(x) {
  if (typeof x !== "boolean") error("expected a boolean");
  return x;
}
function number(x) {
  if (typeof x !== "number") error("expected an integer");
  return x;
}
function checked(x) {
  if (!Number.isSafeInteger(x)) error("integer overflow");
  return x === 0 ? 0 : x;
}
export function vector(x) {
  if (!Array.isArray(x)) error("expected a vector");
  return x;
}
export function unary(op, x) {
  return op === "!" ? !boolean(x) : checked(-number(x));
}
export function binary(op, a, b) {
  if (op === "==" || op === "!=") {
    if (
      (a !== null && typeof a === "object") ||
      (b !== null && typeof b === "object")
    )
      error("equality requires scalar values");
    return op === "==" ? a === b : a !== b;
  }
  if (op === "+" && typeof a === "string" && typeof b === "string")
    return a + b;
  number(a);
  number(b);
  switch (op) {
    case "+":
      return checked(a + b);
    case "-":
      return checked(a - b);
    case "*":
      return checked(a * b);
    case "/":
    case "%":
      if (b === 0) error("division by zero");
      // Integer division must be exact before truncation even near the safe-integer limit.
      return Number(op === "/" ? BigInt(a) / BigInt(b) : BigInt(a) % BigInt(b));
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    default:
      throw Error("unknown operator " + op);
  }
}
export function render(value) {
  if (value === null) return "nil";
  if (Array.isArray(value))
    return (
      "[" +
      value
        .map((v) => (typeof v === "string" ? JSON.stringify(v) : render(v)))
        .join(", ") +
      "]"
    );
  if (typeof value === "object") return "<fn " + value.name + ">";
  return String(value);
}
function builtin(name, arity, apply) {
  return { type: "builtin", name, arity, apply };
}
export const builtins = new Map(
  [
    builtin("len", 1, ([x]) =>
      typeof x === "string" ? [...x].length : vector(x).length,
    ),
    builtin("at", 2, ([x, n]) => {
      const seq = typeof x === "string" ? [...x] : vector(x);
      number(n);
      if (n < 0 || n >= seq.length) error("index outside sequence");
      return seq[n];
    }),
    builtin("push", 2, ([x, v]) => [...vector(x), v]),
    builtin("set_at", 3, ([x, i, v]) => {
      vector(x);
      number(i);
      if (i < 0 || i >= x.length) error("index outside sequence");
      const copy = x.slice();
      copy[i] = v;
      return copy;
    }),
    builtin("str", 1, ([v]) => render(v)),
  ].map((fn) => [fn.name, fn]),
);

export function checkCall(fn, args) {
  if (!fn || (fn.type !== "closure" && fn.type !== "builtin"))
    error("value is not callable");
  if (args.length !== fn.arity)
    error(fn.name + " expects " + fn.arity + " arguments, got " + args.length);
}
