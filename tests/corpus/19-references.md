# Cross-references \label{sec:intro}

Cross-references follow LaTeX conventions: a `\label{key}` attaches an
anchor to a numbered target, `\ref{key}` resolves to the number with a
clickable link. The user writes the prefix word themselves so the
grammar stays natural — "voir algorithme \ref{alg:bubble}" rather
than a frozen "Algorithme 1".

## Captioned blocks \label{sec:blocks}

A figure carries a label after the caption:

```tree svg "Décomposition de la phrase" \label{fig:syntax}
S
  NP
    Det
    N
  VP
    V
    NP
      Det
      N
```

A table:

```csv "Effectifs par équipe" \label{tab:teams}
Équipe, Effectif
Backend, 12
Frontend, 8
```

An algorithm:

```algorithm "Tri à bulles" \label{alg:bubble}
for i from 1 to n - 1 do
  for j from 0 to n - i - 1 do
    if A[j] > A[j + 1] then
      swap A[j] and A[j + 1]
    end
  end
end
return A
```

A code listing:

```python "Médiane" \label{lst:median}
def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
```

## Équations \label{sec:equations}

Une équation étiquetée se voit attribuer un numéro à droite :

$$
\int_0^1 x^2 \, dx = \frac{1}{3} \label{eq:cube}
$$

Tandis qu'une équation non étiquetée n'en reçoit pas :

$$
e^{i\pi} + 1 = 0
$$

Une seconde équation étiquetée prend le numéro suivant dans la
séquence des équations numérotées :

$$
\sum_{k=1}^n k = \frac{n(n+1)}{2} \label{eq:gauss}
$$

## Références croisées \label{sec:refs}

On peut maintenant écrire : « \ref{sec:intro} » introduit la
notation, la figure \ref{fig:syntax} illustre la décomposition,
le tableau \ref{tab:teams} donne les effectifs, l'algorithme
\ref{alg:bubble} décrit le tri, et le listing \ref{lst:median}
calcule la médiane. Voir aussi l'équation \ref{eq:cube} pour
l'intégrale, et l'équation \ref{eq:gauss} pour la somme. Les
références aux **sections** rendent le titre lui-même (pratique
quand les sections ne sont pas numérotées), tandis que celles aux
**figures / tableaux / algos / listings / équations** rendent le
numéro.

## Erreur de référence

Une référence inconnue (typo) est rendue visible en rouge avec
un tooltip : voir la section \ref{sec:typo-inexistante}.
