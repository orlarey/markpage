# md2pdf

Convertisseur Markdown → PDF entièrement côté client, déployable
automatiquement sur GitHub Pages.

Voir [SPEC.md](SPEC.md) pour les spécifications détaillées.

## Stack

- TypeScript + [Vite](https://vitejs.dev/)
- [CodeMirror 6](https://codemirror.net/) pour l'éditeur
- [marked](https://github.com/markedjs/marked) pour le parsing Markdown
- [pdfmake](https://github.com/bpampuch/pdfmake) pour la génération PDF

## Développement

```sh
npm install
npm run dev        # serveur de dev
npm run build      # build de production dans dist/
npm run typecheck  # vérification TypeScript
```

## Déploiement

Un push sur `main` déclenche le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
qui publie l'application sur GitHub Pages.

Pour activer Pages : **Settings → Pages → Source : GitHub Actions**.
