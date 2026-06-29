# Local styling — `::: style`

A `::: style` block applies a fixed allowlist of typographic overrides
(colour, size, font, weight, alignment, italic, underline, line-height)
to its Markdown body — never arbitrary CSS or HTML.

::: style color=#0b3d91 size=22pt align=center weight=700
A blue, 22-point, centred, bold title
:::

The body is ordinary Markdown, and the style cascades into it:

::: style font="Lora" color=#333333
This whole block is Lora grey.

::: style size=20pt italic
A nested aside — still Lora grey, but larger and italic (the inner
block wins).
:::
:::

A centred caption:

::: style align=center size=10pt color=#666666
Figure 1 — a centred caption set small and grey.
:::
