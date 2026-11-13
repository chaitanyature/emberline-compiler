import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, compile, execute, interpret, verify } from "../src/index.js";
import { optimize } from "../src/optimize.js";

test("reduced bytecode executes fewer instructions and preserves the artifact input", () => {
  const source = readFileSync(
    new URL("../examples/optimize.em", import.meta.url),
    "utf8",
  );
  const ast = parse(source),
    raw = compile(ast),
    before = JSON.stringify(raw),
    after = optimize(raw);
  const a = execute(raw),
    b = execute(after);
  assert.equal(JSON.stringify(raw), before);
  assert.deepEqual(a.output, b.output);
  assert.deepEqual(b.output, interpret(ast).output);
  assert.ok(b.profile.instructions < a.profile.instructions - 4000);
  assert.doesNotMatch(JSON.stringify(after), /unreachable/);
});

test("folds preserve the original error and location when a constant operation fails", () => {
  const raw = compile(parse("if false {print 3/0;}\nprint 2 + true;"));
  const err = (image) => {
    try {
      execute(image);
    } catch (e) {
      return [e.message, e.point];
    }
  };
  assert.deepEqual(err(raw), err(optimize(raw)));
  assert.deepEqual(
    execute(optimize(compile(parse("print true or (3/0==4);")))).output,
    ["true"],
  );
});

test("a jump into a partial expression remains a valid block entry", () => {
  const raw = compile(parse("let a=false;print (a or true) and (2*3 == 6);"));
  assert.deepEqual(execute(optimize(raw)).output, ["true"]);
});

test("optimizing a jump cycle preserves the budgeted infinite loop", () => {
  const raw = compile(parse("while true { if true {continue;} }"));
  const optimized = optimize(raw);
  verify(optimized);
  assert.throws(() => execute(optimized, { limit: 12 }), /limit exceeded/);
});
