# Footnotes and definition lists

A paragraph with a footnote reference[^a] and a second one[^b]. The first reference inlines the definition into `\footnote{}`; subsequent references to the same id use `\footnotemark[N]`.

Re-using the first footnote[^a] should not duplicate the body.

[^a]: First footnote with **bold** and a [link](https://example.com).
[^b]: Second footnote, a different one.

A definition list:

Coffee
: A dark drink brewed from roasted beans.
: Also a common reason engineers stay awake.

Tea
: An infusion of leaves in hot water.
