# Inference rules

A simple rule with two premises on separate lines and an unnamed conclusion:

```inference
\Gamma \vdash e_1 : \text{int}
\Gamma \vdash e_2 : \text{int}
---
\Gamma \vdash e_1 + e_2 : \text{int}
```

A rule with two premises on the same line (separated by `;`) and a label:

```inference (T-App)
\Gamma \vdash f : A \to B ; \Gamma \vdash x : A
---
\Gamma \vdash f\,x : B
```

A rule using Unicode operators (the inference body goes to LaTeX as-is and relies on `newunicodechar`/the math mode for rendering):

```inference (Ax)
---
\Gamma, x : \tau \vdash x : \tau
```
