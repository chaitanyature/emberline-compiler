# Emberline

Emberline compiles a small lexical language into a portable stack-machine program. Closures capture mutable cells, tail calls reuse frames, and the compiler can optimize control flow before writing a bytecode file. A separate tree-walking interpreter provides an execution oracle.

## Run the telemetry workload

Requires Node.js 20 or newer. The compiler, VM, examples, and tests use the standard library.

```sh
npm run demo
npm test
node bin/ember.js disasm examples/telemetry.em
node bin/ember.js build examples/telemetry.em --opt -o telemetry.embc
node bin/ember.js verify telemetry.embc
node bin/ember.js exec telemetry.embc
```

The workload sends seven readings to two independent rolling windows. Each returned function retains its own vector, cursor, and sum. The final outputs are `port [48, 16, 21]` and `sea [42, 21, 28]`, representing the rolling sum, truncated mean and peak. The `check` command compiles and executes the program and compares every output line against source interpretation. The built artifact can run in a separate process without the source file.

```ember
fn counter(start) {
  return fn(increment) {
    start = start + increment;
    return start;
  };
}
let sample = counter(2);
print sample(5);
print sample(1);
```

## Two measurable experiments

| Workload | Run it | Observed result |
| --- | --- | --- |
| Tail recursion | `npm run profile` | A 100,000-step countdown completes in 1,200,017 VM instructions. All recursive calls are tail calls. Maximum frame depth is two, including the entry function. |
| Optimizer | `node bin/ember.js profile examples/optimize.em`, then append `--opt` | Both runs print 75. Folding constant arithmetic and simplifying control flow reduce the executed instruction count from 23,020 to 18,020. These figures measure dispatches, not elapsed time. |

For a hands-on change, move the recursive call inside an addition, as in `return 1 + count_down(n - 1, acc);`, and reduce the starting depth to 200. Inspect the disassembly and profile. The additional work after the invocation requires preserving the caller's frame.

## Pipeline

```text
source → lexer → Pratt parser → lexical resolution + closure conversion → bytecode
                      │                                                   │
                      └── tree-walking interpreter                        ├── verify
                                                                          ├── optimize (optional)
                                                                          └── verify → stack VM
```

- **Resolution.** Each source-level declaration receives a frame slot. A nested function either captures a local slot from its immediate parent or forwards a captured slot through intervening functions. Globals follow the same rule inside the entry function. Builtins are resolved by name at compile time.
- **Closures.** Every `BIND` creates a fresh mutable cell. An assignment updates an existing cell. This distinction lets closures created on separate loop iterations retain different bindings, while sibling functions still see mutations to a shared binding.
- **Verification.** The reader validates lexical parentage, capture descriptors, jump targets, instruction operands and source locations. A worklist propagates stack heights over reachable control-flow edges. Mismatched join heights, underflow, unbalanced returns and reachable fallthrough reject an artifact. Dynamic types and uninitialized slots remain checked at execution time.
- **Optimization.** Basic blocks limit constant propagation across entry points. A pass folds scalar arithmetic, simplifies constant branches, threads jump chains, marks live instructions and relocates branch targets. Folding leaves an operation in place when computing it would raise a runtime error. The rewritten image passes the same verifier.
- **Independent execution.** The reference engine binds textual names using persistent scope maps and shared binding cells. It does not read bytecode, slots, capture descriptors, or compiled jumps. Both engines share the parser and primitive operators, so independent expected-value tests also cover those layers.
- **Diagnostics.** Instructions retain source lines and columns. Runtime failures report the active function chain and source span. Artifact-only execution can still identify the embedded line and column. Profiles count dispatches, calls, tail calls, maximum live frames and per-opcode frequency.

## Language and runtime boundary

Emberline supports lexical declarations, assignment, named recursive functions, function literals, block scopes, if/else, while, break/continue and early returns. Operators cover checked safe integers, scalar equality, string concatenation and strict boolean short-circuiting. Vectors use immutable update operations. Builtins include `len`, `at`, `push`, `set_at` and `str`. The language reference includes declaration order, runtime error semantics and examples. [Language reference](docs/language.md)

The bytecode format favors reviewable JSON over compact encoding. Every local is a heap cell, even when it never escapes. Vector updates copy their backing array. JavaScript's garbage collector reclaims cells and closure cycles. Program output is accumulated in memory for deterministic comparison. An instruction budget bounds dispatch count, while allocations, string lengths and output size can still grow. Use trusted programs and artifacts. [Bytecode contract](docs/bytecode.md)

## Correctness checks

The suite contains 22 top-level tests. A deterministic generator builds 400 programs with nested lexical scopes, two independently mutable closures, arithmetic trees and looped calls. Each is interpreted from source and run as both original and optimized serialized bytecode. Targeted cases check distinct per-iteration captures, recursion, short-circuit side effects, numeric endpoints, jump cycles, invalid capture descriptors, inconsistent stack heights, error spans, and command-line artifact round trips. CI runs on Node 20 and 22.

The implementation is organized under `src/`. Start with `compiler.js` for scope resolution, `verify.js` for stack analysis, `optimize.js` for control-flow rewriting, and `vm.js` for dispatch.
