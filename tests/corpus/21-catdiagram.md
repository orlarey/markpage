# catdiagram — diagrammes commutatifs déclaratifs

Le fence ` ```catdiagram ` accepte la syntaxe documentée dans CD-SPEC.md
(signature + équations + flèches universelles). Le parser produit du
Mermaid que le pipeline existant rend en SVG.

## Triangle commutatif

```catdiagram "Triangle commutatif" \label{fig:triangle}
objects:  A, B, C
morphisms:
  f : A -> B
  g : B -> C
  h : A -> C
equations:
  h = g . f
```

Voir \ref{fig:triangle}.

## Carré du produit

```catdiagram
objects:  X, A, B, P
morphisms:
  pi1 : P -> A
  pi2 : P -> B
  f   : X -> A
  g   : X -> B
induced:
  u : X -> P  by (f, g)
equations:
  pi1 . u = f
  pi2 . u = g
```

## Coproduit

```catdiagram
objects:  X, A, B, S
morphisms:
  i1 : A -> S
  i2 : B -> S
  f  : A -> X
  g  : B -> X
induced:
  v : S -> X  by (f, g)
equations:
  v . i1 = f
  v . i2 = g
```

## Carré de naturalité

```catdiagram
objects:  F(X), F(Y), G(X), G(Y)
morphisms:
  Fh    : F(X) -> F(Y)
  Gh    : G(X) -> G(Y)
  eta_X : F(X) -> G(X)
  eta_Y : F(Y) -> G(Y)
equations:
  Gh . eta_X = eta_Y . Fh
```

## Pullback

```catdiagram "Pullback" \label{fig:pullback}
objects:  X, A, B, C, P
morphisms:
  f  : A -> C
  g  : B -> C
  p1 : P -> A
  p2 : P -> B
  h  : X -> A
  k  : X -> B
induced:
  u : X -> P  by (h, k)
equations:
  f . p1 = g . p2
  f . h  = g . k
  p1 . u = h
  p2 . u = k
```

## Égaliseur (paire parallèle)

```catdiagram
objects:  E, A, B, Z
morphisms:
  f : A -> B
  g : A -> B
  e : E -> A
  h : Z -> A
induced:
  u : Z -> E  by (h)
equations:
  f . e = g . e
  f . h = g . h
  e . u = h
```

## Fonctorialité

```catdiagram
objects:  F(A), F(B), F(C)
morphisms:
  Ff   : F(A) -> F(B)
  Fg   : F(B) -> F(C)
  Fgof : F(A) -> F(C)
equations:
  Fgof = Fg . Ff
```

## Objet terminal

```catdiagram
objects:  T, A
induced:
  t : A -> T  by ()
```

## Avec modificateurs (mono / epi / iso)

```catdiagram
direction: LR
objects:  A, B, C
morphisms:
  i : A -> B (mono)
  p : B -> C (epi)
  q : A -> C (iso)
```

## Cas d'erreur — équation mal typée

L'équation `f = g` ci-dessous est mal typée (f va de A vers B, g va de
B vers C). Le typechecker doit la rejeter avec une diagnostic
positionnel.

```catdiagram
objects:  A, B, C
morphisms:
  f : A -> B
  g : B -> C
equations:
  f = g
```
