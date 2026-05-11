# Math

Inline math: $x^2 + y^2 = z^2$ and Greek $\alpha + \beta = \gamma$.

Display math with `$$`:

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

Unicode in math (exercises back-conversion): $α → β$, $ℕ ⊂ ℝ$, $∀x ∈ ⟦0, n⟧$.

Math fence:

```math
\sum_{i=1}^n i = \frac{n(n+1)}{2}
```

Pre-wrapped `align*` inside a math fence (must not be re-wrapped in `\[..\]`):

```math
\begin{align*}
a &= b + c \\
d &= e + f
\end{align*}
```
