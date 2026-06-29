# Page backdrops — `::: background`

A `::: background` block places content *behind* the page — a full-bleed
fill, a positioned minipage, or a corner logo. Backdrops show in the
paginated preview / PDF (not the continuous editor view).

A full-page fill (no `size`):

::: background fill=#0b1f3a
:::

A logo dropped into the top-right corner (`at=x,y` in [0,1]², `size` =
fraction of the page width):

::: background at=0.92,0.06 size=0.12
![](img-logo.svg)
:::

A centred title block over a dark cover — a `::: style` nested inside a
`::: background` (four colons on the outer fence so it closes correctly):

:::: background first at=0.5,0.42 size=0.8
::: style color=#ffffff align=center size=34pt weight=700
Annual report
:::
::::
