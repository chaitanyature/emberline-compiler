import test from "node:test";
import assert from "node:assert/strict";
import { compile, parse, execute, interpret, optimize } from "../src/index.js";

function rng(seed) {
  let n = seed;
  return (max) => {
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    return (n >>> 0) % max;
  };
}
function arithmetic(random, depth, names) {
  if (!depth || random(4) === 0)
    return random(2) ? String(random(15) - 7) : names[random(names.length)];
  const a = arithmetic(random, depth - 1, names),
    b = arithmetic(random, depth - 1, names);
  switch (random(5)) {
    case 0:
      return "(-" + a + ")";
    case 1:
      return "((" + a + ")%11 * (" + b + ")%7)";
    case 2:
      return "(" + a + " / " + (random(6) + 1) + ")";
    case 3:
      return "(" + a + " + " + b + ")";
    default:
      return "(" + a + " - " + b + ")";
  }
}

test("400 typed generated programs agree after bytecode serialization", () => {
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed * 41 + 7);
    const initial = r(15) - 7,
      steps = r(6) + 1;
    // Generate bounded integer trees inside several scope patterns. The
    // reference engine resolves textual names rather than compiler slot IDs.
    const expression = arithmetic(r, 3, ["x", "delta", "a"]);
    const predicate = arithmetic(r, 2, ["x", "delta", "a"]);
    const src = `let x=${initial};fn factory(a){
      let x=a + x;
      return fn(delta){if x<${predicate}{x=${expression};}
          else {let a=delta+1;x=${expression};}return x;};
    }let f=factory(${r(7)});let g=factory(${r(9)});
    let i=0;while i<${steps}{
      print [f(i),g(i-2),x];i=i+1;
    }`;
    const ast = parse(src);
    const artifact = JSON.parse(JSON.stringify(compile(ast)));
    const expected = interpret(ast).output;
    for (const candidate of [artifact, optimize(artifact)])
      assert.deepEqual(
        execute(candidate).output,
        expected,
        "seed " + seed + "\n" + src,
      );
  }
});
