import { fault } from "./errors.js";
import { builtins } from "./values.js";
import { verify } from "./verify.js";

class FunctionBuilder {
  constructor(image, parent, node, name, params) {
    this.image = image;
    this.parent = parent;
    this.index = image.functions.length;
    this.fn = {
      name,
      parent: parent?.index ?? null,
      arity: params.length,
      locals: 0,
      captures: [],
      code: [],
    };
    image.functions.push(this.fn);
    this.scopes = [new Map()];
    this.loop = null;
    for (const p of params) this.declare(p.value, p);
  }
  declare(name, point) {
    const scope = this.scopes.at(-1);
    if (scope.has(name))
      fault("compile", "duplicate declaration '" + name + "'", point);
    const slot = this.fn.locals++;
    scope.set(name, slot);
    return slot;
  }
  resolve(name, point) {
    for (let i = this.scopes.length - 1; i >= 0; i--)
      if (this.scopes[i].has(name)) return ["local", this.scopes[i].get(name)];
    if (!this.parent) {
      if (builtins.has(name)) return ["builtin", name];
      fault("compile", "undefined name '" + name + "'", point);
    }
    const from = this.parent.resolve(name, point);
    if (from[0] === "builtin") return from;
    let index = this.fn.captures.findIndex(
      ([kind, slot]) => kind === from[0] && slot === from[1],
    );
    if (index === -1) {
      index = this.fn.captures.length;
      this.fn.captures.push(from);
    }
    return ["capture", index];
  }
  emit(op, arg, p) {
    const i = this.fn.code.length;
    this.fn.code.push([op, arg, p.line, p.column]);
    return i;
  }
  patch(i) {
    this.fn.code[i][1] = this.fn.code.length;
  }
  chunk(body) {
    for (const s of body) this.statement(s);
  }
  block(body) {
    this.scopes.push(new Map());
    this.chunk(body);
    this.scopes.pop();
  }
  statement(s) {
    const p = s.point;
    switch (s.kind) {
      case "let": {
        // The initializer resolves in the enclosing environment, before the new name exists.
        this.expr(s.value);
        const slot = this.declare(s.name, p);
        this.emit("BIND", slot, p);
        return;
      }
      case "named": {
        const slot = this.declare(s.name, p);
        this.emit("CONST", null, p);
        this.emit("BIND", slot, p);
        this.expr(s.value);
        this.emit("STORE_LOCAL", slot, p);
        return;
      }
      case "assign": {
        const [kind, slot] = this.resolve(s.name, p);
        if (kind === "builtin")
          fault("compile", "cannot assign builtin '" + s.name + "'", p);
        this.expr(s.value);
        this.emit(kind === "local" ? "STORE_LOCAL" : "STORE_CAPTURE", slot, p);
        return;
      }
      case "block":
        return this.block(s.body);
      case "print":
      case "discard":
        this.expr(s.value);
        this.emit(s.kind === "print" ? "PRINT" : "POP", null, p);
        return;
      case "return":
        if (!this.parent) fault("compile", "return outside a function", p);
        if (s.value.kind === "call") this.call(s.value, true);
        else {
          this.expr(s.value);
          this.emit("RETURN", null, p);
        }
        return;
      case "if": {
        this.expr(s.test);
        const otherwise = this.emit("JFALSE", 0, p);
        this.block(s.yes);
        const done = this.emit("JUMP", 0, p);
        this.patch(otherwise);
        this.block(s.no);
        this.patch(done);
        return;
      }
      case "while": {
        const start = this.fn.code.length,
          outer = this.loop;
        this.loop = { start, breaks: [] };
        this.expr(s.test);
        const done = this.emit("JFALSE", 0, p);
        this.block(s.body);
        this.emit("JUMP", start, p);
        this.patch(done);
        for (const j of this.loop.breaks) this.patch(j);
        this.loop = outer;
        return;
      }
      case "break":
      case "continue":
        if (!this.loop) fault("compile", s.kind + " outside a loop", p);
        if (s.kind === "break") this.loop.breaks.push(this.emit("JUMP", 0, p));
        else this.emit("JUMP", this.loop.start, p);
        return;
      default:
        throw Error("unknown statement " + s.kind);
    }
  }
  call(e, tail) {
    this.expr(e.target);
    for (const a of e.args) this.expr(a);
    this.emit(tail ? "TAILCALL" : "CALL", e.args.length, e.point);
  }
  expr(e) {
    const p = e.point;
    switch (e.kind) {
      case "literal":
        this.emit("CONST", e.value, p);
        return;
      case "read": {
        const [kind, slot] = this.resolve(e.name, p);
        this.emit(
          { local: "LOAD_LOCAL", capture: "LOAD_CAPTURE", builtin: "BUILTIN" }[
            kind
          ],
          slot,
          p,
        );
        return;
      }
      case "vector":
        for (const x of e.items) this.expr(x);
        this.emit("VECTOR", e.items.length, p);
        return;
      case "unary":
        this.expr(e.value);
        this.emit("UNARY", e.op, p);
        return;
      case "binary":
        this.expr(e.left);
        if (e.op === "and" || e.op === "or") {
          this.emit("DUP", null, p);
          const done = this.emit(e.op === "and" ? "JFALSE" : "JTRUE", 0, p);
          this.emit("POP", null, p);
          this.expr(e.right);
          this.emit("BOOL", null, p);
          this.patch(done);
        } else {
          this.expr(e.right);
          this.emit("BINARY", e.op, p);
        }
        return;
      case "call":
        return this.call(e, false);
      case "fun": {
        const child = new FunctionBuilder(
          this.image,
          this,
          e,
          e.name,
          e.params,
        );
        child.chunk(e.body);
        child.finish(e.point);
        this.emit("CLOSURE", child.index, p);
        return;
      }
      default:
        throw Error("unknown expression " + e.kind);
    }
  }
  finish(point) {
    this.emit("CONST", null, point);
    this.emit("RETURN", null, point);
  }
}

export function compile(program) {
  const image = { format: "emberline/1", functions: [] };
  const entry = new FunctionBuilder(image, null, program, "<main>", []);
  entry.chunk(program.body);
  entry.finish(program.point);
  verify(image);
  return image;
}
