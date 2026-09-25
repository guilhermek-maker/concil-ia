#!/usr/bin/env sh
# Publica a pasta web/ na branch gh-pages (GitHub Pages) sem precisar de GitHub Actions.
# Uso: sh ops/publicar-site.sh   (rode na raiz do repositório, com tudo commitado)
set -e
git diff --quiet -- web || { echo "Há alterações não commitadas em web/. Faça o commit antes."; exit 1; }
git branch -D gh-pages >/dev/null 2>&1 || true
git subtree split --prefix web -b gh-pages
git push -f origin gh-pages
echo "Publicado. O GitHub Pages atualiza em 1–2 minutos: https://guilhermek-maker.github.io/fechai/"
