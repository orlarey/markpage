# Lightweight formal specification method

Every software development project begins with a specification written in
Markdown.

This specification adopts a **lightweight formalisation** approach: it
aims to express the project, its concepts and its constraints precisely,
without resorting to automated proof tools or heavy mathematical syntax.

The specification is intended primarily for a competent reader: the
project's developer and the AIs used as reasoning, design or
implementation tools. It is not meant to be pedagogical; general
computing notions are assumed and not detailed.

Formal elements (types, invariants, rules, transitions) are expressed
compactly and systematically accompanied by a brief natural-language
reformulation. This redundancy is meant to ease re-reading, reduce
ambiguities, and allow direct conceptual verification of the
specification.

The writing seeks a strict balance between **clarity**, **precision**
and **conciseness**. Conciseness is essential in order to keep a global
view of the system, limit cognitive load, and let the reader — human or
AI — hold the entire model in mind.

## Reference scenario

Every specification must begin with a reference scenario.

The scenario is a narrative, non-normative description of the typical
operation of the system under consideration. It introduces the actors,
the objects and their roles, without formalisation and without
anticipating implementation choices.

The scenario defines neither rules, invariants, nor mandatory behaviours.
It serves only as conceptual support for reading the specification: it
names the entities before they are defined, and gives meaning to the
formal sections that follow.

The specification proper begins after the scenario, with the definition
of the domain vocabulary.

## Markdown document format

The specification is written in Markdown, meant to be rendered by
[markpage](https://markpage.org) (paginated PDF via MathJax + paged.js).
The **precise dialect** — special fences (`math`, `inference`, `chart`,
`csv`, `mermaid`), Pandoc callouts, input ligatures — is documented in
[AGENTS.md](AGENTS.md); this document focuses on **method**.

The source must remain readable in a plain text editor, independently of
the rendering engine. We therefore prefer **UTF-8** characters for common
symbols — `∀`, `∃`, `∈`, `⊆`, `≤`, `≥`, `≠`, `→`, `⇒`, `∧`, `∨`, `¬`,
Greek letters — rather than an equivalent LaTeX command. One symbol =
one character.

LaTeX (`$…$` inline, ` ```math ` as a block) is available and recommended
**only for expressions that have no direct Unicode equivalent**:
fractions, indexed sums or integrals, matrices, `align` / `cases`
environments, calligraphic letters (`\mathcal{O}`), etc. A lone `\alpha`
is not justified — write `α` instead.

Sets, relations, predicates and rules are expressed in **structured
text**, without resorting to an executable formal language.

Every block uses an explicit fence; no block should remain without a
language indication. Common fences:

- ` ```math ` — displayed equations.
- ` ```inference (Name) ` — inference rules (see *Notation* below).
- ` ```ebnf `, ` ```json `, ` ```mermaid `, etc. — real languages.

## Characterisation of the approach

The approach combines formal rigour with pragmatism, leaning on a
restricted set of concepts drawn from formal methods, used in a readable
and operational way.

- **Algebraic types**  
  Data structures and operation signatures are defined explicitly using
  algebraic types.

- **Terms**  
  Where necessary, data is formalised as terms of an abstract language
  defined in the specification. These terms support the semantic rules
  and state transformations.

- **Rewrite rules**  
  The system's behaviour is described by rewrite rules over terms,
  rather than by imperative pseudocode. These rules express the semantic
  transformations induced by the system's operations.

- **First-order logic**  
  Invariants and global constraints are expressed in first-order logic,
  using textual notation and UTF-8 symbols.

- **Preconditions and postconditions**  
  Operations are specified behaviourally via preconditions and
  postconditions, in the spirit of *Design by Contract*.

This formal framework aims to describe **what the system is** and
**how it can evolve**, while deliberately leaving open:

- implementation,
- optimisation,
- computation strategy.

These choices are considered to belong to the implementation phase and
may evolve without invalidating the specification.

## Notation

Data and expressions are represented as **terms** of an abstract syntax
defined in BNF notation (`Term ::= Constructor(arg₁, ...) | ...`).
Operations are defined as **semantic functions** denoted `F⟦.⟧ : A → B`,
where `F` is a mnemonic letter (E for evaluation, V for validation, S
for storage, C for creation, T for transition, etc.). Their behaviour is
given by **inference rules** inside an `inference` fence; premises are
separated by `;`, a line of dashes separates premises from conclusion,
and the rule name appears in parentheses in the info-string:

````markdown
```inference (Name)
premise₁; premise₂
---
conclusion
```
````

Global constraints are expressed in **first-order logic** with UTF-8
notation (`∀`, `∃`, `∈`, `⊆`, `∧`, `∨`, `¬`, `⇒`). Sets defined by
comprehension are written `{x ∈ X | P(x)}`, their cardinality `|E|`.
Record updates are written `s{field ← value}`.

## Specification status

The specification has a **normative** status for the domain model,
invariants, transformation rules, and behaviours explicitly described.

Any conforming implementation must respect these elements.

Whatever is not specified is considered intentionally left open. In
particular, the specification does not constrain:

- implementation choices,
- internal non-observable structures,
- optimisation or computation strategies.

The specification may evolve over the course of the project. At any
given time, it constitutes the single reference for evaluating the
conceptual conformity of the system.

## Code commenting convention

To keep a homogeneous codebase usable by both humans and AIs, local code
documentation follows these rules:

- All source-code comments are written in **English**.
- Comments systematically contain **two explicit parts**:
  - `Purpose`: role of the entity in the overall architecture (what it
    is for).
  - `How`: realisation mechanism (what it actually does).

Recommended format for files:

```text
/********************************* filename ************************************
 *
 * Purpose: ...
 * How: ...
 *
 *******************************************************************************/
```

Recommended format for functions, classes, data structures, etc.:

```text
/**
 * Purpose: ...
 * How: ...
 */
```

This convention is normative for the entire project.
