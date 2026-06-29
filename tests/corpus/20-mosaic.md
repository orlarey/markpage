# Mosaic — justified image walls

A `mosaic` fence packs whole images (never cropped) into full-width
rows with no gaps — a clean rectangle. `height=` tunes the density;
`gap=` adds a gutter.

```mosaic "A wall of pictures"
![](img-a.svg)
![](img-b.svg)
![](img-c.svg)
![](img-d.svg)
![](img-e.svg)
```

With a caption and a gutter:

```mosaic "Spaced out" gap=8
![](img-a.svg)
![](img-c.svg)
![](img-e.svg)
```

A missing image degrades gracefully:

```mosaic
![](img-a.svg)
![](does-not-exist.svg)
```
