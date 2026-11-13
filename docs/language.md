# Language reference

A program is a sequence of statements. There is no module loader. Braces create lexical blocks. Statements that end with an expression require a semicolon. Block statements and named function declarations end at their closing brace. Source is UTF-8; identifiers use ASCII letters, underscores and digits, starting with a letter or underscore. A double slash starts a comment to the end of the line.

```text
statement    = "let" name "=" expression ";"
             | name "=" expression ";"
             | "fn" name "(" parameters ")" block
             | "if" expression block ["else" block]
             | "while" expression block
             | ("break" | "continue") ";"
             | "return" [expression] ";"
             | "print" expression ";"
             | expression ";" | block
block        = "{" { statement } "}"
parameters   = [ name { "," name } ]
arguments    = [ expression { "," expression } ]
primary      = integer | string | name | "nil" | "true" | "false"
             | "(" expression ")" | "[" arguments "]"
             | "fn" "(" parameters ")" block
```

Calls bind most tightly and accept any expression producing a function. Unary minus and logical negation bind next. Binary operators are left-associative, in descending precedence: multiply/divide/remainder, add/subtract, ordered comparisons, equality, `and`, `or`. Calls evaluate the target first and then arguments from left to right.

## Scope and function calls

A declaration is visible after its initializer. A new name can shadow an outer declaration, including a builtin. Named functions establish their own binding before compiling their body, enabling direct recursion. A later declaration in the same block does not retroactively change name lookup. Duplicate names in one lexical scope are rejected, including a local reusing a parameter name. Forward declarations are unavailable. Mutual recursion can be expressed by declaring variables before assigning function literals.

```ember
let even = nil;
let odd = nil;
even = fn(n) { if n == 0 { return true; } return odd(n - 1); };
odd = fn(n) { if n == 0 { return false; } return even(n - 1); };
print even(42);
```

All arguments are positional and arity is exact. Falling off a function returns nil. A call directly returned by a function reuses its frame. Closures retain cell references beyond the lifetime of the defining frame. Each new block iteration creates new bindings for local declarations. Assignment to an existing name is visible to closures that captured that binding.

## Values and operations

| Value | Behavior |
| --- | --- |
| Integer | Safe-integer range −(2⁵³−1) through 2⁵³−1. Arithmetic raises an error on overflow. Division truncates toward zero, and remainder follows the dividend's sign. |
| String | JSON-compatible double-quoted literals and escapes. `+` concatenates two strings. `len` and `at` count Unicode code points. |
| Boolean | Conditions, `!`, `and` and `or` require booleans. Short-circuit evaluation suppresses evaluation of an unused operand. |
| Nil | Literal `nil`, also the default function return value. |
| Vector | Heterogeneous immutable sequence. `push(v,x)` returns an appended copy. `set_at(v,i,x)` returns a modified copy. `at` requires an in-bounds integer index. |
| Function | May be stored in vectors, passed as an argument, returned, and recursively invoked. |

Scalar equality permits comparisons across scalar types and never coerces its operands. Functions and vectors raise an error when compared for equality. Ordered comparison requires integers. Arithmetic also requires integers except the string/string form of addition.
