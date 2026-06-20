# Fence syntax — @markpage/blocks

Reference for the six fenced blocks this package renders. Each is a fenced code
block; the first word after the opening backticks is the fence name, and an
optional `"Quoted title"` becomes an auto-numbered caption when rendered through
[`@markpage/marked`](https://www.npmjs.com/package/@markpage/marked).

> This covers only the blocks shipped in `@markpage/blocks`. For markpage's full
> authoring guide (math, mermaid, callouts, letterhead, running headers, …), see
> [AI-AUTHORING.md](https://github.com/orlarey/markpage/blob/main/AI-AUTHORING.md).

---

## chart — line / bar plots from inline CSV

First line = headers (column 1 is the X label, the rest are Y series); following
lines are values. Separator auto-detected (tab > `;` > `,`); decimal commas
(`3,14`) are recognised.

````
```chart line "Audio latency"
buffer (samples), latency (ms)
64,   1.3
128,  2.7
256,  5.3
```
````

- Type: `line` or `bar`. X auto-detects numbers, ISO dates (`YYYY-MM-DD`), or
  categories. Multiple Y columns → coloured lines / grouped bars + legend.

**Scale options** (after the type / title, all optional):

| Option                     | Effect                                       |
| :------------------------- | :------------------------------------------- |
| `y-min=V` / `y-max=V`      | Force the Y bounds (`.` decimals)            |
| `x-min=V` / `x-max=V`      | Force the X bounds (number or ISO date)      |
| `y-ref=V` or `V:"label"`   | Dashed horizontal reference line(s)          |
| `y-scale=log` (or `log-y`) | Logarithmic Y axis                           |

`y-ref` takes several at once: `y-ref=0.25:"floor",1.0:"ideal"` (labels may
contain spaces). Bar charts anchor at 0 by default; `y-min=auto` opts back into
free scaling.

---

## bda — Faust block-diagram-algebra circuits

A single algebraic expression over five binary operators applied to primitive
boxes; rendered as a left-to-right signal-flow circuit (SVG).

````
```bda "Accumulator"
1 : +~_
```
````

Operators, **highest precedence first** (Prio = binding level, higher = tighter):

| Op   | Prio | Name       | Meaning                                     |
| :--- | :--: | :--------- | :------------------------------------------ |
| `~`  | 4    | recursion  | `A ~ B` — feedback loop, `B` mirrored       |
| `,`  | 3    | parallel   | side-by-side, arities add                   |
| `:`  | 2    | sequential | outputs of left feed inputs of right        |
| `<:` | 1    | split      | one output fans out to many inputs (modulo) |
| `:>` | 1    | merge      | many outputs sum into fewer inputs (modulo) |

**Precedence trap:** `,` binds tighter than `:`, so `A : B , C : D` is
`A : (B , C) : D` — parenthesise to place sequences in parallel:
`(A : B) , (C : D)`.

Primitives: numbers, identity `_`, cut `!`, arithmetic (`+ - * /`), comparisons,
math functions (`sin`, `cos`, …), and quoted labels `"name"` or `X[in,out]`
(a label defaults to arity `(1,1)`). The positional arg `delays` (alias `faust`)
draws `z⁻¹` boxes on feedback wires.

---

## category — commutative diagrams

Describe a small category by its morphisms and equations; objects are inferred
from the signatures. Rendered as a native SVG (Mermaid fallback for hard
layouts).

````
```category "Pullback"
f  : A -> C
g  : B -> C
p1 : P -> A
p2 : P -> B
u  : X -> P by (h, k)

f . p1 = g . p2
```
````

- `name : Source -> Target` declares a morphism.
- `f . g` is composition (right-to-left); `f = g` an equation (commutativity).
- `u : X -> P by (h, k)` marks a morphism guaranteed by a universal property
  (rendered dashed). Identifiers are Unicode-aware (`p₁`, `π`, …).

A type error (mismatched domain/codomain) renders as a red error block.

---

## adt — algebraic data types

BNF-ish type definitions: `LHS ::= Ctor(args) | …`, typeset as an aligned grid
with constructor highlighting. Trailing `(* … *)` comments become right-side
annotations.

````
```adt
Expr ::= Const(c)              (* c ∈ ℝ *)
       | Vec(v)
       | Op(o, Expr, Expr)

Op   ::= Add | Sub | Mul | Div
```
````

Identifiers defined as a LHS get the type colour; bare constructors get the
constructor colour; lowercase names stay plain.

---

## diff — unified-diff coloration

Per-line tinting: green additions (`+`), red removals (`-`), neutral context,
tinted hunk (`@@`) and file (`+++`/`---`) headers. A quoted caption is optional;
the body is treated as text.

````
```diff "Patch to review"
@@ -1,3 +1,4 @@
 def quicksort(xs):
-    pivot = xs[0]
+    import random
+    pivot = random.choice(xs)
```
````

---

## tree — indented outline → Unicode tree or SVG

A 2-space / tab indented outline becomes a Unicode box-drawing tree (default)
or a top-down SVG diagram (`svg` keyword). One node per line — indentation is
the hierarchy.

````
```tree "Project layout"
markpage
  src
    chart.ts
  tests
```

```tree svg "AST"
Expr
  Op
    Add
```
````

Use Unicode mode for filesystem / project structure, `svg` mode for syntax trees.
