#!/bin/sh
# Haelt die Freigabe des Wandgeraets eingehaengt.
#
# Warum `mount volume` und nicht `mount_smbfs`: mount_smbfs liest den
# Schluesselbund nicht — auch nicht im Vordergrund, es liegt also nicht an
# launchd — und antwortet ohne Passwort mit „server rejected the connection:
# Authentication error". Der Weg, den auch der Finder nimmt, geht ueber
# NetAuthAgent, und der kennt den Schluesselbund. Am 2026-09-21 beides gemessen.
#
# Das Passwort steht deshalb nirgends hier drin und wird auch nicht getippt:
# einmal im Finder mit ⌘K verbinden und dabei „Passwort im Schluesselbund
# sichern" ankreuzen, danach findet NetAuthAgent es von selbst.
#
# Laeuft beim Anmelden und danach jede Minute (siehe die .plist daneben). Steht
# die Freigabe schon, ist das ein grep und ein exit — der Rechner merkt nichts.
set -eu

PUNKT="/Volumes/wochenwerk"
GERAET="wochenwerk.local"
FREIGABE="smb://wochenwerk@${GERAET}/wochenwerk"

# Schon da? Dann nichts tun. `mount` schreibt „… on /Volumes/wochenwerk (smbfs…",
# und die Klammer haelt „wochenwerk-1" aus dem Treffer heraus.
if mount | grep -q " on ${PUNKT} ("; then
  exit 0
fi

# Unterwegs, Gerät aus, WLAN weg: der Normalfall und kein Fehler. Leise beenden,
# damit launchd das nicht als kaputt zaehlt.
if ! /usr/bin/nc -z -G 3 "${GERAET}" 445 >/dev/null 2>&1; then
  exit 0
fi

# Ohne Schluesselbund-Eintrag wuerde NetAuthAgent einen Dialog aufmachen — jede
# Minute, den ganzen Tag. Lieber einmal sagen, was fehlt.
if ! /usr/bin/security find-internet-password -s "${GERAET}" >/dev/null 2>&1; then
  echo "wochenwerk: kein Schluesselbund-Eintrag fuer ${GERAET}. Einmal im Finder ⌘K auf ${FREIGABE} und dabei „Passwort im Schluesselbund sichern“." >&2
  exit 0
fi

# Das uebriggebliebene Verzeichnis, das die ganze Falle ist: liegt unter
# /Volumes ein echtes Verzeichnis mit unserem Namen, haengt macOS die Freigabe
# nach /Volumes/wochenwerk-1 — und der Browser sucht weiter unter dem alten
# Pfad. Aufraeumen geht nur als root, also wird es gesagt und nicht getan.
if [ -d "${PUNKT}" ]; then
  echo "wochenwerk: ${PUNKT} ist ein uebriggebliebenes Verzeichnis, kein Mountpunkt. Einmal: sudo rmdir '${PUNKT}'" >&2
  exit 0
fi

/usr/bin/osascript -e "mount volume \"${FREIGABE}\"" >/dev/null

# Und nachsehen, ob sie da gelandet ist, wo der Kalender sie sucht.
if ! mount | grep -q " on ${PUNKT} ("; then
  echo "wochenwerk: eingehaengt, aber nicht unter ${PUNKT} — $(mount | grep "${GERAET}" || echo 'nirgends')" >&2
  exit 1
fi
