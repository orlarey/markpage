# Tree block

Indent-based outlines become Unicode box-drawing trees. Useful
for filesystem layouts in READMEs, syntax trees, dependency
hierarchies, or any other ordered nesting.

A single-rooted file tree (typical README shape):

```tree
markpage
  src
    main.ts
    preview.ts
    settings.ts
  tests
    corpus
      01-headings.md
      02-inline.md
  package.json
```

Multi-rooted forest (renders the roots as siblings under an
implicit empty parent):

```tree
animals
  mammals
    cats
    dogs
  birds
    crows
plants
  trees
    oaks
  herbs
    basil
```

Syntax tree (top-down SVG) — same indent syntax, just add `svg`:

```tree svg
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
