# Charts — native SVG plots

The `chart` fence draws a small SVG chart from inline data. The first
token picks the kind (`line` / `bar`); a quoted title may follow.

A bar chart:

```chart bar "Quarterly sales"
Q1, 3
Q2, 5
Q3, 4
Q4, 7
```

A line chart with options (`y-min` / `y-max`):

```chart line "Temperature" y-min=0 y-max=30
Mon, 12
Tue, 18
Wed, 21
Thu, 16
Fri, 24
```

A multi-series line chart:

```chart line "Two series"
x, a, b
1, 2, 5
2, 4, 3
3, 6, 6
4, 5, 8
```
