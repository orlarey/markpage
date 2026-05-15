# Algebraic data types

The `adt` fence renders BNF-ish type definitions with aligned
separators and constructor / type-name highlighting.

```adt
Expr ::= Const(c)              (* c ∈ ℝ *)
       | Vec(v)                 (* v ∈ 𝒱 *)
       | Op(o, Expr, Expr)      (* o ∈ Ω *)
       | Split(Expr)

Op   ::= Add | Sub | Mul | Div
```

## Warnings on unrecognised lines

A typo in the head (here `:=` instead of `::=`) is surfaced as a
visible warning above whatever else parsed, rather than being
silently dropped:

```adt
Expr := Bad                (* missing colon — head doesn't match *)
Other ::= Good | AlsoGood
```
