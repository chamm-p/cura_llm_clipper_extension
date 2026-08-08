#!/usr/bin/env bash
# Baut das Verteil-ZIP der Extension.
#
# Enthalten ist NUR, was der Browser zum Laden braucht: Manifest, src/, icons/.
# Draussen bleiben .git, docs/, tools/ und .DS_Store — Entwicklungs-Beiwerk,
# das die Nutzer nur verwirrt und das ZIP unnoetig aufblaeht.
#
# Der Name traegt die Version aus dem Manifest, damit auf einem Rechner mit
# mehreren Downloads erkennbar bleibt, welcher Stand welcher ist.

set -euo pipefail
cd "$(dirname "$0")/.."

version=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
ziel="dist/cura-clipper-${version}.zip"

# Vor dem Packen pruefen: ein ZIP mit kaputtem Modul faellt sonst erst beim
# Nutzer auf — und genau das ist schon einmal passiert.
./tools/pruefen.sh >/dev/null || { echo "Pruefung fehlgeschlagen — nicht gebaut."; exit 1; }

mkdir -p dist
rm -f "$ziel"

# -x schliesst aus; .DS_Store taucht auf macOS in jedem Verzeichnis auf.
zip -r -q "$ziel" manifest.json src icons \
  -x "*.DS_Store" -x "__MACOSX/*"

groesse=$(du -h "$ziel" | cut -f1)
echo "Gebaut: $ziel ($groesse)"
echo
echo "Inhalt:"
# ``unzip -Z1`` listet nur die Namen — spart das Zurechtschneiden der
# Tabellenausgabe, deren ``head -n -2`` es auf macOS ohnehin nicht gibt.
unzip -Z1 "$ziel" | sed 's/^/  /'
