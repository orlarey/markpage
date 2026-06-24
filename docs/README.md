# markpage — specifications & design docs

Architecture, protocol and feature-design documents for
[markpage](../README.md). For *writing* markpage Markdown, see
[AI-AUTHORING.md](../AI-AUTHORING.md) (at the repo root); for the project
overview, the [README](../README.md).

## Architecture & protocol

| Doc | What it covers | Status |
| :-- | :-- | :-- |
| [SPEC.md](SPEC.md) | App architecture: storage model, render pipelines, i18n, LaTeX export, test harness | Reference, kept current |
| [MCP-SPEC.md](MCP-SPEC.md) | The MCP bridge: action↔tool audit, WebSocket protocol, `tools.json` contract | Livré (v0.29.0) |

## Feature design specs

The original design documents. Every feature below has shipped, so they read
as reference **plus** history — their "plan d'implémentation" / "questions
ouvertes" sections are kept for the record.

| Doc | Feature | Status |
| :-- | :-- | :-- |
| [CATEGORY-SPEC.md](CATEGORY-SPEC.md) | `category` — commutative diagrams | Livré |
| [MOSAIC-SPEC.md](MOSAIC-SPEC.md) | `mosaic` — justified image gallery | Livré |
| [TOC-PLUS-SPEC.md](TOC-PLUS-SPEC.md) | `::: toc+` — table of contents + plan | Livré |
| [FILE-MANAGEMENT-SPEC.md](FILE-MANAGEMENT-SPEC.md) | Document/asset storage, disk link (modèle d'origine, voir VOLUMES-SPEC) | Livré (phases 1–4) ; supplanté par VOLUMES-SPEC |
| [VOLUMES-SPEC.md](VOLUMES-SPEC.md) | Système de fichiers unifié : un Ouvrir, une racine, volumes montés | Livré (0.32.0) |
| [GITHUB-SYNC-SPEC.md](GITHUB-SYNC-SPEC.md) | Documents partagés via un dépôt GitHub (PAT, sans serveur), R1–R4 + fork | Livré (0.32.0) |

## Methodology

| Doc | What it covers | Status |
| :-- | :-- | :-- |
| [FORMAL-METHOD-SPEC.md](FORMAL-METHOD-SPEC.md) | How specifications are written in this project | Normative |

> **Note for authors:** when a feature changes, update its spec's status banner
> (top of the file) and this index in the same change.
