# Admonitions

A theorem (rendered as an amsthm environment):

::: theorem
The sum of angles in a triangle equals $\pi$.
:::

A theorem with a custom title:

::: theorem [Pythagoras]
For a right triangle, $a^2 + b^2 = c^2$.
:::

A lemma (shared counter with theorem):

::: lemma
Every chain has a maximal element (Zorn-flavoured).
:::

A note (tcolorbox):

::: note
This is a plain note.
:::

A warning with a custom title:

::: warning [À lire avant tout]
Read this carefully before proceeding.
:::

An unknown class (falls back to a neutral tcolorbox with the class name as title):

::: unknown-class
This admonition uses a class we don't recognise.
:::
