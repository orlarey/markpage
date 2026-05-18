# Citations

Pandoc-style `[@key]` citations with manual `[@key]: …` definitions.
Numbered in order of first appearance, collected at the end as a
References section.

Quicksort runs in $O(n \log n)$ on average[@hoare1962], but degrades
to $O(n^2)$ on already-sorted input unless a randomised pivot is
used[@sedgewick1978]. A second reference to[@hoare1962] reuses the
same number.

## Unknown keys pass through

A reference to a key with no definition stays as literal text:
[@nonexistent-key] is rendered verbatim.

[@hoare1962]: Hoare, C. A. R. (1962). *Quicksort*. The Computer Journal 5(1), 10-16.
[@sedgewick1978]: Sedgewick, R. (1978). *Implementing Quicksort programs*. CACM 21(10), 847-857.
