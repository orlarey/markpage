# Captions across block types

A `"quoted caption"` after the language tag wraps any block in an
auto-numbered `<figure>`. Each kind keeps its own counter:
`Figure N` for visual blocks, `Tableau N` for data, `Listing N` for
code, `Algorithme N` for pseudocode.

A captioned table:

```csv "Effectifs par équipe"
Équipe, Effectif, Budget
Backend, 12, 1.2M
Frontend, 8, 0.7M
Data, 5, 0.5M
```

A captioned tree diagram:

```tree svg "Décomposition de la phrase"
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

A captioned code listing:

```python "Fonction utilitaire"
def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
```

A captioned algorithm:

```algorithm "Recherche linéaire"
Input: array A, value x
for i from 0 to length(A) - 1 do
  if A[i] = x then
    return i
  end
end
return -1
```

Same kinds without a caption fall through to the plain renderer
(no `<figure>` wrapper, no number burned):

```csv
A, B
1, 2
```

```tree svg
root
  leaf
```
