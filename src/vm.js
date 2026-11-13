import { EmberError, fault } from "./errors.js";
import {
  builtins,
  binary,
  boolean,
  checkCall,
  render,
  unary,
} from "./values.js";
import { verify } from "./verify.js";

export function execute(image, { limit = 5_000_000, trace = null } = {}) {
  verify(image);
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError("positive integer instruction limit required");
  const output = [],
    frames = [],
    profile = {
      instructions: 0,
      calls: 0,
      tailCalls: 0,
      maxFrames: 1,
      opcodes: Object.create(null),
    };
  function frame(fnIndex, captures, args) {
    const fn = image.functions[fnIndex],
      locals = new Array(fn.locals);
    for (let i = 0; i < args.length; i++) locals[i] = { value: args[i] };
    return { fn, captures, locals, stack: [], pc: 0 };
  }
  frames.push(frame(0, [], []));
  let point;
  function cell(array, index) {
    if (!array[index]) fault("runtime", "unbound bytecode slot", point);
    return array[index];
  }
  function leave(value) {
    frames.pop();
    if (frames.length) frames.at(-1).stack.push(value);
  }
  try {
    while (frames.length) {
      const f = frames.at(-1),
        pc = f.pc++,
        [op, arg, line, column] = f.fn.code[pc],
        s = f.stack;
      point = { line, column };
      if (++profile.instructions > limit)
        fault("runtime", "instruction limit exceeded", point);
      profile.opcodes[op] = (profile.opcodes[op] ?? 0) + 1;
      if (trace)
        trace({
          function: f.fn.name,
          pc,
          op,
          operand: arg,
          point,
          stackDepth: s.length,
          frames: frames.length,
        });
      switch (op) {
        case "CONST":
          s.push(arg);
          break;
        case "BUILTIN":
          s.push(builtins.get(arg));
          break;
        case "BIND":
          f.locals[arg] = { value: s.pop() };
          break;
        case "LOAD_LOCAL":
          s.push(cell(f.locals, arg).value);
          break;
        case "STORE_LOCAL":
          cell(f.locals, arg).value = s.pop();
          break;
        case "LOAD_CAPTURE":
          s.push(f.captures[arg].value);
          break;
        case "STORE_CAPTURE":
          f.captures[arg].value = s.pop();
          break;
        case "CLOSURE": {
          const fn = image.functions[arg],
            cells = fn.captures.map(([kind, idx]) =>
              cell(kind === "local" ? f.locals : f.captures, idx),
            );
          s.push({
            type: "closure",
            name: fn.name,
            arity: fn.arity,
            fnIndex: arg,
            captures: cells,
          });
          break;
        }
        case "DUP":
          s.push(s.at(-1));
          break;
        case "POP":
          s.pop();
          break;
        case "VECTOR":
          s.push(s.splice(s.length - arg, arg));
          break;
        case "UNARY":
          s.push(unary(arg, s.pop()));
          break;
        case "BINARY": {
          const right = s.pop(),
            left = s.pop();
          s.push(binary(arg, left, right));
          break;
        }
        case "BOOL":
          s.push(boolean(s.pop()));
          break;
        case "JUMP":
          f.pc = arg;
          break;
        case "JTRUE":
        case "JFALSE":
          if (boolean(s.pop()) === (op === "JTRUE")) f.pc = arg;
          break;
        case "PRINT":
          output.push(render(s.pop()));
          break;
        case "RETURN":
          leave(s.pop());
          break;
        case "CALL":
        case "TAILCALL": {
          const args = s.splice(s.length - arg, arg),
            fn = s.pop();
          checkCall(fn, args);
          const tail = op === "TAILCALL";
          profile.calls++;
          if (tail) profile.tailCalls++;
          if (fn.type === "builtin") {
            const v = fn.apply(args);
            if (tail) leave(v);
            else s.push(v);
          } else {
            if (tail) frames.pop();
            frames.push(frame(fn.fnIndex, fn.captures, args));
            profile.maxFrames = Math.max(profile.maxFrames, frames.length);
          }
          break;
        }
      }
    }
  } catch (error) {
    if (error instanceof EmberError) {
      error.point ??= point;
      error.frames = frames
        .slice(-12)
        .reverse()
        .map((f) => f.fn.name);
    }
    throw error;
  }
  return { output, profile };
}
