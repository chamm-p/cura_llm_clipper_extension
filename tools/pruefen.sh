#!/usr/bin/env bash
# Vorab-Pruefung der Extension. Vor jedem Commit laufen lassen.
#
# Warum es das gibt: `node --check` hat einen als ES-Modul ungueltigen String
# durchgewunken (ein typografisches „…" schloss mit einem GERADEN " und beendete
# den String zu frueh). Chrome brach das Modul beim Laden ab — sichtbar blieb nur
# die Kopfzeile des Popups. Die Pruefung hier parst deshalb ALS MODUL.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fehler=0
melde() { printf '%s %s\n' "$1" "$2"; }

echo "── JS: als ES-Modul parsen ──"
for f in src/*.js; do
  # `--check` allein reicht nicht (siehe oben). Wir lassen Node das File als
  # Modul aufloesen: ein Syntaxfehler schlaegt hier zu, ein fehlender Import
  # (ERR_MODULE_NOT_FOUND) ist erwartbar und kein Syntaxproblem.
  ausgabe=$(node --input-type=module --eval "import './$f'" 2>&1)
  if grep -q "SyntaxError" <<<"$ausgabe"; then
    melde "FEHLER" "$f"
    grep -m3 -A2 "SyntaxError" <<<"$ausgabe" | sed 's/^/    /'
    fehler=1
  else
    melde "OK    " "$f"
  fi
done

echo
echo "── Manifest ──"
if python3 -m json.tool manifest.json >/dev/null 2>&1; then
  melde "OK    " "manifest.json ist valides JSON"
else
  melde "FEHLER" "manifest.json ist kein valides JSON"; fehler=1
fi

python3 - <<'PY' || fehler=1
import json, os, sys
m = json.load(open("manifest.json"))
pfade = set()
def sammle(o):
    if isinstance(o, dict):
        for v in o.values():
            if isinstance(v, str) and v.endswith((".png", ".js", ".html", ".css")):
                pfade.add(v)
            else:
                sammle(v)
    elif isinstance(o, list):
        for i in o:
            sammle(i)
sammle(m)
fehlt = [p for p in sorted(pfade) if not os.path.isfile(p)]
for p in fehlt:
    print(f"FEHLER  Datei aus dem Manifest fehlt: {p}")
sys.exit(1 if fehlt else 0)
PY

echo
echo "── DOM-IDs: im JS benutzt, im HTML vorhanden? ──"
for paar in popup options; do
  html=$(grep -o 'id="[^"]*"' "src/$paar.html" | sed 's/id="//;s/"//' | sort -u)
  js=$(grep -o '\$("[^"]*")' "src/$paar.js" | sed 's/\$("//;s/")//' | sort -u)
  fehlend=$(comm -23 <(echo "$js") <(echo "$html"))
  if [ -n "$fehlend" ]; then
    melde "FEHLER" "$paar: im JS referenziert, im HTML nicht vorhanden:"
    echo "$fehlend" | sed 's/^/    /'
    fehler=1
  else
    melde "OK    " "$paar: alle referenzierten IDs vorhanden"
  fi
done

echo
if [ "$fehler" -eq 0 ]; then
  echo "Alles in Ordnung."
else
  echo "Es gibt Befunde (siehe oben)."
fi
exit "$fehler"
