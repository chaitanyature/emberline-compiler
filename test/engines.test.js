import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, compile, execute, interpret } from "../src/index.js";

function match(source, expected) {
  const ast = parse(source),
    img = compile(ast);
  const reference = interpret(ast),
    vm = execute(img);
  assert.deepEqual(vm.output, reference.output);
  assert.deepEqual(vm.output, expected);
  return vm.profile;
}

test("rolling telemetry and higher-order transforms have stable output", () => {
  const source = (n) =>
    readFileSync(new URL("../examples/" + n + ".em", import.meta.url), "utf8");
  match(source("telemetry"), [
    "port [12, 12, 12]",
    "sea [40, 40, 40]",
    "port [21, 10, 12]",
    "sea [68, 34, 40]",
    "port [39, 13, 18]",
    "port [48, 16, 21]",
    "sea [42, 21, 28]",
  ]);
  match(source("pipeline"), ["[-15, 3, 27, 57]"]);
});

test("closures share a cell, forward captures across three functions, and survive return", () => {
  match(
    `fn box(v) {
    fn read() {return v;}
    fn build() {return fn(delta){v=v+delta;return read();};}
    return [build(),read];
  }
  let handles=box(11);print at(handles,0)(5); print at(handles,1)();`,
    ["16", "16"],
  );
});

test("loop declarations allocate distinct cells on every iteration", () => {
  match(
    `let i=0;let fs=[];
    while i<3{let own=i;fs=push(fs,fn(){own=own+1;return own;});i=i+1;}
    print at(fs,2)();print at(fs,0)();print at(fs,2)();`,
    ["3", "1", "4"],
  );
});

test("lexical binding follows declaration order and initializer scope", () => {
  match(
    `let tone="global";{fn report(){return tone;}let tone=tone+" local";print report();print tone;}`,
    ["global", "global local"],
  );
});

test("logical operators short circuit, enforce types and preserve evaluation order", () => {
  match(
    `let steps=[];fn mark(x){steps=push(steps,x);return x;}
    print false and (mark(1)==1);print true or (mark(2)==2);
    fn f(a,b){return a-b;}print f(mark(9),mark(4));print steps;`,
    ["false", "true", "5", "[9, 4]"],
  );
});

test("nested loops retain their own break and continue destinations", () => {
  match(
    `let i=0;let records=[];while i<4{
    i=i+1;if i==2{continue;}let j=0;while true{j=j+1;if j==3{break;}records=push(records,i*10+j);}
  } print records;`,
    ["[11, 12, 31, 32, 41, 42]"],
  );
});

test("tail-call frames are recycled; ordinary recursion preserves continuations", () => {
  const code = readFileSync(
    new URL("../examples/tail.em", import.meta.url),
    "utf8",
  );
  const profile = match(code, ["100000"]);
  assert.equal(profile.tailCalls, 100000);
  assert.equal(profile.maxFrames, 2);
  match("fn fib(n){if n<2{return n;}return fib(n-1)+fib(n-2);}print fib(12);", [
    "144",
  ]);
});

test("integer, string and immutable vector semantics", () => {
  match(
    `let a=[1,2];print set_at(a,0,8);print a;print -7/3;print -7%3;print at("a🪐b",1);
         print len("a🪐b");print 9007199254740991/7;print 1+2*3;print !false;`,
    [
      "[8, 2]",
      "[1, 2]",
      "-2",
      "-1",
      "🪐",
      "3",
      String(9007199254740991n / 7n),
      "7",
      "true",
    ],
  );
});

test("runtime failures agree across engines", () => {
  for (const [code, message] of [
    ["print 9007199254740991+1;", /integer overflow/],
    ["print true and 1;", /boolean/],
    ["print 1 or true;", /boolean/],
    ["print 3/0;", /division by zero/],
    ["print at([],0);", /outside sequence/],
    ["print len(3);", /vector/],
    ["fn f(x){return x;}print f();", /expects 1/],
    ["print 3(1);", /not callable/],
    ["print []==[];", /scalar/],
  ]) {
    const ast = parse(code),
      image = compile(ast);
    assert.throws(() => execute(image), message);
    assert.throws(() => interpret(ast), message);
  }
});

test("bad source is diagnosed before execution", () => {
  for (const [code, message] of [
    ["break;", /outside a loop/],
    ["return 1;", /outside a function/],
    ["while true{fn f(){continue;}}", /outside a loop/],
    ["let a=1;let a=2;", /duplicate/],
    ["fn f(a,a){}", /duplicate/],
    ["print later;let later=0;", /undefined/],
    ["len=42;", /builtin/],
    ['print "unterminated;', /unterminated/],
    ["print 1 + ;", /expression/],
  ])
    assert.throws(() => compile(parse(code)), message);
});

test("both execution budgets can interrupt a non-terminating program", () => {
  const ast = parse("while true {}");
  assert.throws(() => interpret(ast, { limit: 100 }), /limit exceeded/);
  assert.throws(() => execute(compile(ast), { limit: 100 }), /limit exceeded/);
});
