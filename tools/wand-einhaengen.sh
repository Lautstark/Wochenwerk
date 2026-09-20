#!/bin/sh
# Haengt die Freigabe des Wandgeraets an einen festen Platz im Home ein.
#
# Warum nicht /Volumes: haengt macOS eine Freigabe ein, waehrend ein Rest des
# alten Mountpunkts herumliegt, nimmt es /Volumes/wochenwerk-1 — und der Browser
# sucht weiter unter dem alten Pfad. Ein Ordner im Home wird nie umbenannt, also
# kann der Kalender ihn einmal waehlen und danach in Ruhe gelassen werden.
#
# Das Passwort kommt aus dem Schluesselbund und steht nirgends hier drin: einmal
# im Finder mit ⌘K verbinden und dabei „Passwort im Schluesselbund sichern"
# ankreuzen, dann findet mount_smbfs es von selbst.
#
# Laeuft beim Anmelden und danach jede Minute (siehe die .plist daneben). Ist die
# Freigabe schon da, ist das ein grep und ein exit — der Rechner merkt nichts.
set -eu

PUNKT="$HOME/Wochenwerk-Wand"
FREIGABE="//wochenwerk@wochenwerk.local/wochenwerk"

# Schon eingehaengt? Dann nichts tun. `mount` schreibt den Punkt in Klammern
# dahinter, also wird auf das Wort mit Leerzeichen ringsum geprueft.
if mount | grep -q " ${PUNKT} "; then
  exit 0
fi

# Ein Verzeichnis, das von einem frueheren Mount uebrig ist, ist leer und stoert
# nicht; eines mit Inhalt waere der lokale Ordner, in den frueher versehentlich
# geschrieben wurde, und darueber wird nichts gehaengt.
mkdir -p "${PUNKT}"
if [ -n "$(ls -A "${PUNKT}" 2>/dev/null)" ]; then
  echo "wochenwerk: ${PUNKT} ist nicht leer — da liegt etwas, das kein Mountpunkt ist." >&2
  exit 1
fi

# Nicht erreichbar ist kein Fehler, sondern der Normalfall unterwegs. Leise
# beenden, damit launchd das nicht als kaputt zaehlt.
if ! /usr/bin/nc -z -G 3 wochenwerk.local 445 >/dev/null 2>&1; then
  exit 0
fi

exec /sbin/mount_smbfs "${FREIGABE}" "${PUNKT}"
