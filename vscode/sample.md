---
title: markpage preview — sample
author: You
---

# markpage preview — sample

A document exercising the markpage extensions, to test the VS Code preview.

::: note
This is a **callout**. Inline math: $a^2 + b^2 = c^2$.
:::

## Math

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

## Mermaid

```mermaid
graph LR
  Edit --> Render --> Preview
```

## A chart

```chart bar Quarterly
Q1, 3
Q2, 5
Q3, 4
```

## A commutative diagram

```category
f : A -> B
g : B -> C
```

## Code + table + footnote

```python
def square(x):
    return x * x
```

| Feature | Works |
|---|---|
| callouts | ✅ |
| math | ✅ |

A claim with a footnote.[^1]

[^1]: The footnote body, collected at the end.

> A blockquote, for good measure.
