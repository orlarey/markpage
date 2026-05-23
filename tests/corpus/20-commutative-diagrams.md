# Commutative diagrams

Commutative diagrams are typeset with the **AMS-CD** environment,
available inside any `$$ … $$` block or `` ```math `` fence. Each
row uses `&` to separate columns; arrows live between them.

A basic square:

$$
\begin{CD}
  A  @>f>>  B \\
  @VgVV    @VVhV \\
  C  @>>k>  D
\end{CD}
$$

Wrapped as a figure with a caption and a cross-reference target:

```math "Universal property of the pullback" \label{fig:pullback}
\begin{CD}
  P  @>p_1>>  A \\
  @Vp_2VV    @VVfV \\
  B  @>>g>    C
\end{CD}
```

The pullback diagram in \ref{fig:pullback} is universal: any pair
of arrows from another object factors uniquely through \(P\).

Functoriality, in one row (cf. \ref{fig:pullback} above for a 2D
shape):

$$
\begin{CD}
  F(X)  @>F(f)>>  F(Y) \\
  @|              @| \\
  F(X)  @>>F(f)>  F(Y)
\end{CD}
$$
