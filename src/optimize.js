import { EmberError } from "./errors.js";
import { binary, boolean, unary } from "./values.js";
import { verify } from "./verify.js";

const jumps = new Set(["JUMP", "JFALSE", "JTRUE"]);
const exits = new Set(["RETURN", "TAILCALL"]);
function constant(value, at) {
  return ["CONST", value, at[2], at[3]];
}

// A fold may consume preceding instructions only within this block. A branch
// target in the middle of a candidate expression must remain a valid entry.
function simplify(code) {
  const block = [];
  for (const ins of code) {
    const [op, arg] = ins,
      a = block.at(-2),
      b = block.at(-1);
    try {
      if (op === "BINARY" && a?.[0] === "CONST" && b?.[0] === "CONST") {
        const value = binary(arg, a[1], b[1]);
        block.splice(-2, 2, constant(value, ins));
        continue;
      }
      if ((op === "UNARY" || op === "BOOL") && b?.[0] === "CONST") {
        const value = op === "BOOL" ? boolean(b[1]) : unary(arg, b[1]);
        block[block.length - 1] = constant(value, ins);
        continue;
      }
      if (
        (op === "JTRUE" || op === "JFALSE") &&
        b?.[0] === "CONST" &&
        typeof b[1] === "boolean"
      ) {
        block.pop();
        if ((op === "JTRUE") === b[1])
          block.push(["JUMP", arg, ins[2], ins[3]]);
        continue;
      }
      if (op === "DUP" && b?.[0] === "CONST") {
        block.push(constant(b[1], ins));
        continue;
      }
      if (op === "POP" && b?.[0] === "CONST") {
        block.pop();
        continue;
      }
    } catch (e) {
      // Preserve runtime errors, their original spans and unreachable bad expressions.
      if (!(e instanceof EmberError)) throw e;
    }
    block.push(ins.slice());
  }
  return block;
}

function rewrite(code) {
  const leaders = new Set([0, code.length]);
  for (const [pc, [op, arg]] of code.entries()) {
    if (jumps.has(op)) {
      leaders.add(arg);
      leaders.add(pc + 1);
    } else if (exits.has(op)) leaders.add(pc + 1);
  }
  const starts = [...leaders].sort((a, b) => a - b),
    anchor = new Map(),
    folded = [];
  for (let j = 0; j < starts.length - 1; j++) {
    const start = starts[j];
    anchor.set(start, folded.length);
    for (const ins of simplify(code.slice(start, starts[j + 1])))
      folded.push(ins);
  }
  for (const ins of folded) if (jumps.has(ins[0])) ins[1] = anchor.get(ins[1]);
  // Bypass chains of unconditional jumps. Keep a representative if the chain
  // is a cycle so that an intentional infinite loop remains a loop.
  function target(pc) {
    const visited = new Set();
    while (folded[pc]?.[0] === "JUMP" && !visited.has(pc)) {
      visited.add(pc);
      pc = folded[pc][1];
    }
    return pc;
  }
  for (const ins of folded) if (jumps.has(ins[0])) ins[1] = target(ins[1]);
  const live = new Set(),
    pending = [0];
  while (pending.length) {
    const pc = pending.pop();
    if (live.has(pc)) continue;
    live.add(pc);
    const [op, arg] = folded[pc];
    if (jumps.has(op)) pending.push(arg);
    if (op !== "JUMP" && !exits.has(op)) pending.push(pc + 1);
  }
  const offset = new Map(),
    filtered = [];
  for (const [pc, ins] of folded.entries())
    if (live.has(pc)) {
      offset.set(pc, filtered.length);
      filtered.push(ins);
    }
  for (const ins of filtered)
    if (jumps.has(ins[0])) ins[1] = offset.get(ins[1]);
  return filtered;
}

export function optimize(image) {
  verify(image);
  const copy = structuredClone(image);
  for (const f of copy.functions) f.code = rewrite(f.code);
  verify(copy);
  return copy;
}
