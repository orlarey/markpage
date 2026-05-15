# EBNF railroad diagrams

The `ebnf` fence accepts W3C-style EBNF and emits one railroad
diagram per production.

```ebnf
expression = term, { ("+" | "-"), term };
term = factor, { ("*" | "/"), factor };
factor = number | "(", expression, ")";
```

A parse error renders a visible `<pre class="ebnf-error">` block
instead of blowing up the document:

```ebnf
this is :=: not :=: valid EBNF
```
