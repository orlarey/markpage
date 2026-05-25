# bda — Block-Diagram Algebra (à la Faust)

Le fence ` ```bda ` accepte une expression construite avec les cinq
opérateurs de composition de l'algèbre de Faust : `,` parallèle, `:`
séquentiel, `<:` split, `:>` merge, et `~` récursion. Les primitives
sont des identifiants (avec arité par défaut `(1,1)`, ou annotée
`Label[n,m]`), des nombres `(0,1)`, les opérateurs `+ - * /` `(2,1)`,
les fonctions `sin cos exp …` `(1,1)`, ainsi que `_` (identité `(1,1)`)
et `!` (cut `(1,0)`).

## Accumulateur (compteur)

L'exemple canonique de l'algèbre : un nombre constant ré-injecté dans
un `+` rebouclé sur lui-même via `~ _`.

```bda "Accumulateur" \label{fig:acc}
1 : +~_
```

Voir \ref{fig:acc}.

## Accumulateur 2 — récursion avec B composé

Vérifie que les labels du bloc droit (mis en miroir au-dessus) restent
lisibles malgré la réflexion horizontale.

```bda "Accumulateur 2" \label{fig:acc2}
(_,1 : +)~(sin : cos : tan)
```

## Accumulateur — style Faust avec marqueurs `z⁻¹`

Mêmes circuits, mais l'option `delays` (alias `faust`) place un petit
carré blanc au milieu de chaque fil de feedback B→A pour matérialiser le
délai unitaire implicite du `~`.

```bda delays "Accumulateur avec délais"
1 : +~_
```

```bda faust "Multi-fils avec délais"
A[3,3] ~ B[2,2]
```

## Passthrough — chaînes de `_` en seq

Vérifie l'optimisation qui shunte un bloc `_,_,_,…` quand il sert juste
de bundle d'identité dans un seq. Sinon chaque `_` génère un coude à
gauche et un coude à droite, créant des escaliers visuels.

```bda "Passthrough 6 voies"
A[2,3], B[2,3] : _,_,_,_,_,_ : C[6,1]
```

## Double récursion

Cas piégeux du wrap des labels : avec `~` à droite-assoc, ceci parse
en `(_,1:+) ~ (+ ~ (sin:cos:tan))`. Le sous-bloc `(sin:cos:tan)` est
DEUX fois sous une rotation 180°, donc l'unrotation doit cascader.

```bda "Double récursion"
(_,1 : +) ~ + ~ (sin : cos : tan)
```

## Récursion multi-fils

Vérifie que les bundles de feedback s'imbriquent sans se croiser : l'entrée
0 de B (visible en bas après rotation 180°) reçoit la sortie 0 de A (en
haut), l'entrée 1 (au-dessus) reçoit la sortie 1, etc.

```bda "Récursion multi-fils"
A[3,3] ~ B[2,2]
```

## Séquentiel pur

```bda
sin : abs
```

## Parallèle pur

```bda
sin , cos , tan
```

## Split (fan-out)

Une seule sortie distribuée vers les deux entrées de `+` :

```bda
1 <: +
```

## Merge (fan-in)

Quatre sorties sommées vers les deux entrées d'une boîte `(2,1)` :

```bda
1, 2, 3, 4 :> +
```

## Primitives avec arité explicite

```bda
A[2,3] : B[3,1]
```

## Label entre guillemets

```bda
"my filter"[2,1]
```

## Tests étendus

### Deux compteurs indépendants en parallèle

`+~_` est un compteur (équivalent Faust `+ ~ _`). On en met deux en
parallèle, chacun alimenté par sa propre constante.

```bda "Deux compteurs"
1, 2 : +~_ , -~_
```

### Cascade de trois compteurs

Compteur de compteur de compteur. Avec délais visibles.

```bda delays "Cascade de compteurs"
1 : +~_ : +~_ : +~_
```

### Cross-wiring : split / merge à grosse arité

```bda "Cross-wiring 2→4→2"
(sin, cos) <: (+, *, +, *) :> (_, _)
```

### Boucle complexe : split/merge dans une rec multi-fils

```bda "Rec autour d'un split/merge"
((_,_) <: (_,_,_,_) :> (+,+)) ~ (mem, mem)
```

### Croisement de deux câbles

Un grand classique BDA : on permute deux signaux en exploitant le modulo
du split. `out 0` part en position 2 (récupéré par le second `_`), `out 1`
part en position 1 (récupéré par le premier `_`), et les copies en
position 0 et 3 sont jetées dans les `!`.

```bda "Croisement (cross)"
_,_ <: !,_,_,!
```

### Rec à grosses arités avec délais

`Foo[4,5] ~ Bar[3,4]` — 4 entrées de Foo dont 4 consommées par feedback
(0 entrée exposée), 5 sorties dont 3 alimentent Bar, 5 exposées.

```bda delays "Rec 4×5 ~ 3×4"
Foo[4,5] ~ Bar[3,4]
```

### Passthrough plus long

Une chaîne de 8 identités au milieu de deux blocs. Doit rester plat à
gauche (passthrough), avec des elbows propres à droite.

```bda "Passthrough 8 voies"
A[3,8] : _,_,_,_,_,_,_,_ : B[8,2]
```

### Mix de tout

```bda delays "Mix complet"
(1, _ : +) ~ (sin : cos) , (2, _ : *) ~ (tan : exp)
```

## Erreur de typage

Le `:` exige autant de sorties à gauche que d'entrées à droite. Ici
`1` a 1 sortie mais `+` attend 2 entrées :

```bda
1 : +
```
