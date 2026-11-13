import { fault } from "./errors.js";
import { builtins } from "./values.js";

function reject(message) {
  fault("verify", message);
}
const natural = (n) => Number.isSafeInteger(n) && n >= 0;
const slot = (i, size) => natural(i) && i < size;
const scalar = (x) =>
  x === null ||
  typeof x === "boolean" ||
  typeof x === "string" ||
  Number.isSafeInteger(x);
const math = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
]);

function inspect(image, fi, pc) {
  const f = image.functions[fi],
    spec = f.code[pc],
    ctx = "function " + fi + ", pc " + pc + ": ";
  if (!Array.isArray(spec) || spec.length !== 4)
    reject(ctx + "malformed instruction");
  const [op, arg, line, col] = spec;
  if (!natural(line) || !line || !natural(col) || !col)
    reject(ctx + "invalid source location");
  let valid = false,
    need = 0,
    change = 0,
    successors = [pc + 1];
  switch (op) {
    case "CONST":
      valid = scalar(arg);
      change = 1;
      break;
    case "BUILTIN":
      valid = builtins.has(arg);
      change = 1;
      break;
    case "LOAD_LOCAL":
    case "LOAD_CAPTURE":
      valid = slot(arg, op === "LOAD_LOCAL" ? f.locals : f.captures.length);
      change = 1;
      break;
    case "BIND":
    case "STORE_LOCAL":
    case "STORE_CAPTURE":
      valid = slot(arg, op === "STORE_CAPTURE" ? f.captures.length : f.locals);
      need = 1;
      change = -1;
      break;
    case "CLOSURE":
      valid =
        slot(arg, image.functions.length) && image.functions[arg].parent === fi;
      change = 1;
      break;
    case "DUP":
      valid = arg === null;
      need = 1;
      change = 1;
      break;
    case "POP":
    case "PRINT":
      valid = arg === null;
      need = 1;
      change = -1;
      break;
    case "BOOL":
      valid = arg === null;
      need = 1;
      break;
    case "UNARY":
      valid = arg === "-" || arg === "!";
      need = 1;
      break;
    case "BINARY":
      valid = math.has(arg);
      need = 2;
      change = -1;
      break;
    case "VECTOR":
      valid = natural(arg);
      need = arg;
      change = 1 - arg;
      break;
    case "CALL":
    case "TAILCALL":
      valid = natural(arg);
      need = arg + 1;
      change = -arg;
      if (op === "TAILCALL") successors = [];
      break;
    case "JUMP":
      valid = slot(arg, f.code.length);
      successors = [arg];
      break;
    case "JFALSE":
    case "JTRUE":
      valid = slot(arg, f.code.length);
      need = 1;
      change = -1;
      successors.push(arg);
      break;
    case "RETURN":
      valid = arg === null;
      need = 1;
      successors = [];
      break;
    default:
      reject(ctx + "unknown opcode " + String(op));
  }
  if (!valid) reject(ctx + "invalid operand for " + op);
  return { need, change, successors, terminal: !successors.length };
}

export function verify(image) {
  if (
    !image ||
    image.format !== "emberline/1" ||
    !Array.isArray(image.functions) ||
    !image.functions.length
  )
    reject("invalid bytecode header");
  const functions = image.functions;
  for (const [i, f] of functions.entries()) {
    if (
      !f ||
      typeof f.name !== "string" ||
      !natural(f.arity) ||
      !natural(f.locals) ||
      f.arity > f.locals ||
      f.locals > 65535 ||
      !Array.isArray(f.captures) ||
      !Array.isArray(f.code) ||
      !f.code.length
    )
      reject("invalid function " + i);
    if (i === 0) {
      if (f.parent !== null || f.arity || f.captures.length)
        reject("invalid entry function");
    } else if (!slot(f.parent, i)) reject("invalid lexical parent");
    for (const c of f.captures) {
      const parent = functions[f.parent];
      if (
        !Array.isArray(c) ||
        c.length !== 2 ||
        !(
          (c[0] === "local" && slot(c[1], parent.locals)) ||
          (c[0] === "capture" && slot(c[1], parent.captures.length))
        )
      )
        reject("invalid capture descriptor");
    }
  }
  return functions.map((f, i) => {
    const instructions = f.code.map((_, pc) => inspect(image, i, pc));
    const heights = new Map([[0, 0]]),
      pending = [0];
    let maxStack = 0;
    while (pending.length) {
      const pc = pending.pop(),
        depth = heights.get(pc),
        x = instructions[pc];
      if (depth < x.need)
        reject("operand stack underflow in " + f.name + " at " + pc);
      if (x.terminal && depth !== x.need)
        reject("unbalanced return in " + f.name + " at " + pc);
      const after = depth + x.change;
      maxStack = Math.max(maxStack, after);
      for (const next of x.successors) {
        if (next === instructions.length)
          reject("reachable fallthrough in " + f.name);
        if (heights.has(next)) {
          if (heights.get(next) !== after)
            reject("inconsistent stack height at " + next);
        } else {
          heights.set(next, after);
          pending.push(next);
        }
      }
    }
    return { maxStack, reachable: heights.size };
  });
}

export function disassemble(image) {
  const meta = verify(image);
  return image.functions
    .map((f, i) => {
      const head =
        "fn #" +
        i +
        " " +
        f.name +
        "/" +
        f.arity +
        "  locals=" +
        f.locals +
        "  captures=" +
        JSON.stringify(f.captures) +
        "  stack=" +
        meta[i].maxStack;
      return [
        head,
        ...f.code.map(
          ([op, arg, line, col], pc) =>
            "  " +
            String(pc).padStart(4, "0") +
            "  " +
            op.padEnd(14) +
            " " +
            (arg === null && op !== "CONST" ? "" : JSON.stringify(arg)).padEnd(
              12,
            ) +
            " ; " +
            line +
            ":" +
            col,
        ),
      ].join("\n");
    })
    .join("\n\n");
}
