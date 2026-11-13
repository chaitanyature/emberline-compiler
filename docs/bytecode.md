# Bytecode contract

A portable image is JSON with `format: "emberline/1"` and a `functions` array. Function zero is the entry point. Each template records a name, lexical parent, arity, local-slot count, capture descriptors and instruction array. Its source text is not needed to execute it. The format retains numeric line/column locations, which refer to the original source.

An instruction is a four-element tuple `[opcode, operand, line, column]`. A jump target is a zero-based instruction index within that function. Every frame has its own operand stack and local cells. Below, n is an operand count and effects are net changes to the current operand stack.

| Instructions | Effect | Contract |
| --- | ---: | --- |
| CONST, BUILTIN, LOAD_LOCAL, LOAD_CAPTURE, CLOSURE | +1 | Push a literal, builtin, cell value or newly formed closure. |
| BIND, STORE_LOCAL, STORE_CAPTURE | −1 | Install a fresh local cell, or replace a previously bound cell's value. |
| DUP, POP, PRINT | +1 or −1 | Duplicate, discard or render the top operand. |
| BOOL, UNARY, BINARY | 0 or −1 | Dynamically validate a boolean or apply the indicated source operator. |
| VECTOR n | 1−n | Collect n preceding operands into a vector, preserving order. |
| CALL n | −n | Consume the target and n arguments; eventually resume with one result. |
| TAILCALL n | terminal | Consume the target and n arguments and transfer control using the caller's continuation. |
| JUMP, JTRUE, JFALSE | 0 or −1 | Transfer unconditionally or pop a boolean to choose a successor. |
| RETURN | terminal | Consume one return value and resume the caller. |

Each capture descriptor is either `["local", slot]` or `["capture", slot]` relative to the template's immediate lexical parent. A CLOSURE instruction may instantiate only a direct child template. This supports transitive captures without a runtime walk through parent scopes.

### Inspect a change

```sh
node bin/ember.js disasm examples/optimize.em
node bin/ember.js disasm examples/optimize.em --opt
node bin/ember.js build examples/optimize.em --opt -o short.embc
node bin/ember.js dump short.embc
```

In the optimized `checksum` body, the expression `3 * 7 + 4` becomes a single constant. The false branch containing the print disappears. Jump targets refer to relocated offsets. The maximum stack depth in a disassembly header describes reachable code in that artifact.

The instruction trace API runs before dispatch and reports the frame count, function name, opcode, operand, source span, program counter and pre-instruction stack height.

```js
import {parse, compile, execute} from "../src/index.js";
const image = compile(parse("print 6 * 7;"));
const trace = [];
const result = execute(image, {trace: step => trace.push(step), limit: 100});
console.log(result.output, trace.map(s => s.op));
```
