# catdiagram — diagrammes commutatifs déclaratifs

Le fence ` ```catdiagram ` accepte la syntaxe documentée dans CD-SPEC.md :
chaque ligne déclare un morphisme `f : A -> B` ou une équation, dans
la convention CS / mathématique habituelle.

## Triangle commutatif

```catdiagram "Triangle commutatif" \label{fig:triangle}
f : A -> B
g : B -> C
h : A -> C = g . f
```

Voir \ref{fig:triangle}.

## Carré du produit

```catdiagram
pi1 : P -> A
pi2 : P -> B
f   : X -> A
g   : X -> B
u   : X -> P by (f, g)

pi1 . u = f
pi2 . u = g
```

## Coproduit

```catdiagram
i1 : A -> S
i2 : B -> S
f  : A -> X
g  : B -> X
v  : S -> X by (f, g)

v . i1 = f
v . i2 = g
```

## Carré de naturalité

```catdiagram
Fh    : F(X) -> F(Y)
Gh    : G(X) -> G(Y)
eta_X : F(X) -> G(X)
eta_Y : F(Y) -> G(Y)

Gh . eta_X = eta_Y . Fh
```

## Pullback

```catdiagram "Pullback" \label{fig:pullback}
f  : A -> C
g  : B -> C
p1 : P -> A
p2 : P -> B
h  : X -> A
k  : X -> B
u  : X -> P by (h, k)

f . p1 = g . p2
f . h  = g . k
p1 . u = h
p2 . u = k
```

## Égaliseur (paire parallèle)

```catdiagram
f : A -> B
g : A -> B
e : E -> A
h : Z -> A
u : Z -> E by (h)

f . e = g . e
f . h = g . h
e . u = h
```

## Fonctorialité

```catdiagram
Ff   : F(A) -> F(B)
Fg   : F(B) -> F(C)
Fgof : F(A) -> F(C) = Fg . Ff
```

## Objet terminal

```catdiagram
t : A -> T by ()
```

## Avec modificateurs (mono / epi / iso)

```catdiagram
direction: LR
i : A -> B (mono)
p : B -> C (epi)
q : A -> C (iso)
```

## Cas d'erreur — équation mal typée

L'équation `f = g` ci-dessous est mal typée (f va de A vers B, g va de
B vers C). Le typechecker doit la rejeter avec un diagnostic positionnel.

```catdiagram
f : A -> B
g : B -> C
f = g
```
