import test from "node:test";
import assert from "node:assert/strict";
import { parse, compile, verify, execute, disassemble } from "../src/index.js";

const inst = (op, arg = null) => [op, arg, 1, 1];
function image(code, locals = 0) {
  return {
    format: "emberline/1",
    functions: [
      { name: "main", parent: null, arity: 0, locals, captures: [], code },
    ],
  };
}

test("verifier checks targets, operands and every opcode including unreachable ones", () => {
  for (const [code, message] of [
    [[inst("JUMP", 99)], /invalid operand/],
    [[inst("CONST", {}), inst("RETURN")], /invalid operand/],
    [[inst("LOAD_LOCAL", 0), inst("RETURN")], /invalid operand/],
    [[inst("CONST"), inst("RETURN"), inst("GHOST")], /unknown opcode/],
    [[inst("CONST")], /fallthrough/],
    [[inst("PRINT"), inst("RETURN")], /underflow/],
    [[inst("CONST"), inst("CONST"), inst("RETURN")], /unbalanced/],
    [
      [
        inst("CONST", true),
        inst("JFALSE", 4),
        inst("CONST"),
        inst("JUMP", 5),
        inst("JUMP", 5),
        inst("CONST"),
        inst("JUMP", 5),
      ],
      /inconsistent/,
    ],
  ])
    assert.throws(() => verify(image(code)), message);
});

test("capture descriptors and closure templates must match their lexical parent", () => {
  const initial = compile(parse("let v=1;fn f(){return fn(){return v;};}"));
  const bad = structuredClone(initial);
  bad.functions[2].captures[0][1] = 1000;
  assert.throws(() => verify(bad), /invalid capture/);
  const wrong = structuredClone(initial);
  wrong.functions[0].code.find((x) => x[0] === "CLOSURE")[1] = 2;
  assert.throws(() => verify(wrong), /invalid operand/);
});

test("verified images still enforce dynamic types and initialized slots", () => {
  const unbound = image([inst("LOAD_LOCAL", 0), inst("RETURN")], 1);
  assert.doesNotThrow(() => verify(unbound));
  assert.throws(() => execute(unbound), /unbound bytecode slot/);
  const bad = image([inst("CONST", 2), inst("BOOL"), inst("RETURN")]);
  assert.throws(() => execute(bad), /boolean/);
});

test("disassembly includes locations, capture routing and verified stack depth", () => {
  const img = compile(
    parse("let start=1;\nfn adder(x){return start+x;}\nprint adder(4);"),
  );
  const rows = disassemble(img);
  assert.match(rows, /LOAD_CAPTURE/);
  assert.match(rows, /fn #1 adder\/1/);
  assert.match(rows, /stack=2/);
  assert.match(rows, /; 2:/);
  const trace = [];
  assert.deepEqual(execute(img, { trace: (step) => trace.push(step) }).output, [
    "5",
  ]);
  assert.ok(trace.some((x) => x.function === "adder" && x.point.line === 2));
});
