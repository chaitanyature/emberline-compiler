import { EmberError, fault } from "./errors.js";
import {
  binary,
  boolean,
  builtins,
  checkCall,
  render,
  unary,
} from "./values.js";

// A declaration extends a persistent name map. Assignment mutates a shared
// cell. Earlier closures consequently cannot see future lexical declarations.
class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.cells = new Map();
  }
  bind(name, value) {
    const next = new Scope(this.parent);
    next.cells = new Map(this.cells);
    next.cells.set(name, { value });
    return next;
  }
  find(name, p) {
    for (let e = this; e; e = e.parent)
      if (e.cells.has(name)) return e.cells.get(name);
    fault("runtime", "undefined name '" + name + "'", p);
  }
}

export function interpret(program, { limit = 5_000_000 } = {}) {
  const output = [];
  let steps = 0,
    point = program.point;
  const tick = (p) => {
    point = p;
    if (++steps > limit) fault("runtime", "reference step limit exceeded", p);
  };
  let global = new Scope();
  for (const [name, fn] of builtins) global = global.bind(name, fn);
  function closure(e, env) {
    return {
      type: "closure",
      name: e.name,
      arity: e.params.length,
      node: e,
      env,
    };
  }
  function invoke(target, args) {
    while (true) {
      checkCall(target, args);
      if (target.type === "builtin") return target.apply(args);
      let env = new Scope(target.env);
      for (const [i, p] of target.node.params.entries())
        env = env.bind(p.value, args[i]);
      const signal = block(target.node.body, env);
      if (signal?.type !== "tail") return signal?.value ?? null;
      ({ target, args } = signal);
    }
  }
  function expression(e, env) {
    tick(e.point);
    switch (e.kind) {
      case "literal":
        return e.value;
      case "read":
        return env.find(e.name, e.point).value;
      case "fun":
        return closure(e, env);
      case "vector":
        return e.items.map((x) => expression(x, env));
      case "unary":
        return unary(e.op, expression(e.value, env));
      case "binary": {
        const left = expression(e.left, env);
        if (e.op === "and")
          return boolean(left) && boolean(expression(e.right, env));
        if (e.op === "or")
          return boolean(left) || boolean(expression(e.right, env));
        const right = expression(e.right, env);
        point = e.point;
        return binary(e.op, left, right);
      }
      case "call": {
        const target = expression(e.target, env),
          args = e.args.map((x) => expression(x, env));
        point = e.point;
        return invoke(target, args);
      }
      default:
        throw Error("unexpected expression " + e.kind);
    }
  }
  function block(body, env) {
    for (const s of body) {
      tick(s.point);
      switch (s.kind) {
        case "let":
          env = env.bind(s.name, expression(s.value, env));
          break;
        case "named": {
          env = env.bind(s.name, null);
          env.find(s.name, s.point).value = closure(s.value, env);
          break;
        }
        case "assign":
          env.find(s.name, s.point).value = expression(s.value, env);
          break;
        case "print":
          output.push(render(expression(s.value, env)));
          break;
        case "discard":
          expression(s.value, env);
          break;
        case "break":
        case "continue":
          return { type: s.kind };
        case "return":
          if (s.value.kind === "call") {
            const e = s.value,
              target = expression(e.target, env),
              args = e.args.map((x) => expression(x, env));
            return { type: "tail", target, args };
          }
          return { type: "return", value: expression(s.value, env) };
        case "block": {
          const sig = block(s.body, new Scope(env));
          if (sig) return sig;
          break;
        }
        case "if": {
          const which = boolean(expression(s.test, env)) ? s.yes : s.no;
          const sig = block(which, new Scope(env));
          if (sig) return sig;
          break;
        }
        case "while":
          while (boolean(expression(s.test, env))) {
            const sig = block(s.body, new Scope(env));
            if (sig?.type === "break") break;
            if (sig?.type === "return" || sig?.type === "tail") return sig;
          }
          break;
        default:
          throw Error("unexpected statement " + s.kind);
      }
    }
    return null;
  }
  try {
    block(program.body, new Scope(global));
  } catch (err) {
    if (err instanceof EmberError) err.point ??= point;
    throw err;
  }
  return { output, steps };
}
