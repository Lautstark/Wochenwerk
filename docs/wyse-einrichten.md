# Das Wandgerät einrichten

Ein Wyse 5070 (Celeron J4105, 4 GB, 16 GB Flash) wird zu dem Gerät, das
[hardware.md](hardware.md) und [ux.md](ux.md) voraussetzen: es kommt nach einem
Stromausfall allein hoch, zeigt das Board im Vollbild ohne eine Leiste, spricht
auf Knopfdruck, und niemand muss dafür eine Maus in dem Raum haben.

Der Plan in einem Satz: Debian ohne Desktop, Chromium im Kiosk auf
`lautstark.tech/Wochenwerk/`, eine piper-Stimme im Browser, und der
Lautstärkeknopf als Ansagetaste.

## Warum diese Teile

**Debian ohne Desktop**, weil jeder Desktop ein zweites Programm mitbringt, das
Medientasten abfängt — und die Medientasten *sind* hier der Knopf. Ohne Desktop
bekommt Chromium sie zuerst, und das Board kann `AudioVolumeUp` und
`AudioVolumeDown` wirklich schlucken. Auf dem Mac scheitert genau das, siehe
hardware.md.

**Das Board aus dem Netz** statt lokal gebaut, weil ein `git pull` auf dem
Wandgerät eine Wartungsaufgabe ist, die niemand übernimmt. GitHub Pages liefert
die Seite aus, und ein Neuladen holt die neue Version.

**Eine piper-Stimme** statt einer Gerätestimme: Linux hat ohne
`speech-dispatcher` gar keine, und mit ihm klingt sie wie 1995. piper läuft im
Browser, die Stimme wird einmal geladen (63 MB) und jeder Satz nach dem ersten
kommt aus dem Zwischenspeicher.

## 1 — Installations-Stick, am Mac

Das Abbild und seine Prüfsumme holen:

```bash
cd ~/Downloads && curl -fLO https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.6.0-amd64-netinst.iso
```

```bash
echo "65273beed27b2df543b68b65630ba525cfbad8df2b12035732b2dff87d6664e7  debian-13.6.0-amd64-netinst.iso" | shasum -a 256 -c
```

Kommt dort nicht `OK`, ist die Datei unbrauchbar — noch einmal laden, nicht
weitermachen.

Dann den Stick beschreiben. **Der Datenträgername muss stimmen**, sonst
überschreibt der Befehl die falsche Platte: erst auflisten, den Stick an seiner
Größe erkennen, dann die Nummer einsetzen.

```bash
diskutil list external
```

```bash
diskutil unmountDisk /dev/diskN && sudo dd if=~/Downloads/debian-13.6.0-amd64-netinst.iso of=/dev/rdiskN bs=4m status=progress
```

`rdiskN` mit `r` ist die rohe Variante und um ein Vielfaches schneller als
`diskN`. Debians Abbild enthält seit Version 12 die nicht-freie Firmware, damit
das WLAN schon im Installationsprogramm funktioniert — deshalb dieses Abbild und
kein „free"-Abbild.

## 2 — BIOS des 5070

Beim Einschalten **F2** für das Setup, **F12** für ein einmaliges Startmenü.

- Vom USB-Stick starten erlauben, und ihn in der Startreihenfolge vorziehen.
- **Nach Stromausfall wieder einschalten**: unter *Power Management* → *AC
  Recovery* auf *Power On* stellen. Ohne das bleibt die Wand nach einem
  Stromausfall schwarz, bis jemand hinten drückt — und das ist der Fehler, der in
  hardware.md als „Reader offline" ausbuchstabiert ist, nur schlimmer.
- Secure Boot kann bleiben; Debian startet damit. Bootet der Stick trotzdem
  nicht, hier abschalten.

## 3 — Debian installieren

Der Standardweg, mit drei Entscheidungen, auf die es ankommt:

- **Netzwerk**: das WLAN im Installationsprogramm auswählen und die Zugangsdaten
  eintragen. Es schreibt sie nach `/etc/network/interfaces` und
  `/etc/wpa_supplicant/`, und damit steht das WLAN nach jedem Neustart von selbst.
- **Rechnername**: `wochenwerk`. Benutzer ebenfalls `wochenwerk` — die Anleitung
  unten setzt diesen Namen ein.
- **Software-Auswahl** (`tasksel`): **Desktop-Umgebung abwählen**, *SSH server*
  und *standard system utilities* anwählen. Der SSH-Server ist der Grund, dass du
  den Rest vom Mac aus tippen kannst statt vor der Wand zu stehen.

Nach dem Neustart vom Mac aus hineingehen:

```bash
ssh wochenwerk@wochenwerk.local
```

## 4 — Was das Gerät braucht

Als `root` (`su -`):

```bash
apt update && apt install --no-install-recommends xserver-xorg xinit x11-xserver-utils chromium unclutter pipewire pipewire-pulse wireplumber alsa-utils
```

`--no-install-recommends` ist hier keine Sparsamkeit um ihrer selbst willen: die
Empfehlungen ziehen einen halben Desktop nach, und mit ihm die Dienste, die
Medientasten abfangen.

## 5 — Ton

Ausgabe wählen und prüfen — am Monitor über HDMI oder analog, je nachdem, wo die
Lautsprecher hängen:

```bash
wpctl status
```

```bash
speaker-test -c2 -t wav -l1
```

Kommt nichts, ist die falsche Senke voreingestellt: die Nummer aus `wpctl status`
nehmen und `wpctl set-default <nummer>` setzen. Erst weitergehen, wenn hier
wirklich etwas zu hören ist — sonst suchst du später einen Fehler im Board, der
im Kabel liegt.

## 6 — Erst einrichten, dann zumauern

Der Kalender muss **einmal auf diesem Gerät** geöffnet werden: die Stimme liegt
in der IndexedDB dieses Browsers und reist nicht mit — weder über den geteilten
Ordner ([folder.ts](../src/folder.ts)) noch über die Sicherungsdatei
([db.ts](../src/db.ts)), die beide nur Termine, Karten, Personen und Serien
tragen.

Also als Benutzer `wochenwerk`, noch ohne Kiosk:

```bash
startx /usr/bin/chromium https://lautstark.tech/Wochenwerk/kalender/
```

Dort:

1. **Einstellungen → Stimme** → `Thorsten (medium)` oder `Kerstin`, und einmal
   auf **▶ probehören**. Der erste Satz lädt 63 MB und dauert; danach liegt die
   Stimme im Browser.
2. **Einstellungen → Wo alles liegt** oder **Sicherung einlesen** — siehe
   Abschnitt 9.

## 7 — Chromium im Kiosk

Automatisch anmelden, als `root`:

```bash
systemctl edit getty@tty1
```

Hineinschreiben:

```ini
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin wochenwerk --noclear %I $TERM
```

Als Benutzer `wochenwerk` die Anmeldung in eine Sitzung überführen —
`~/.bash_profile`:

```bash
if [ -z "$DISPLAY" ] && [ "$XDG_VTNR" = 1 ]; then exec startx; fi
```

Und `~/.xinitrc`:

```bash
xset s off
xset -dpms
xset s noblank
unclutter -idle 0 &
exec chromium \
  --kiosk \
  --no-first-run \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --password-store=basic \
  https://lautstark.tech/Wochenwerk/
```

Was diese Schalter tun, und warum jeder einzelne dasteht:

- `--kiosk` nimmt die Leiste weg, `--noerrdialogs` und
  `--disable-session-crashed-bubble` das Fenster „Chromium wurde nicht korrekt
  beendet" — das ist genau das, was nach einem Stromausfall über der Woche
  stünde, und niemand ist da, um es wegzuklicken.
- `--autoplay-policy=no-user-gesture-required`, damit der erste Ton nicht an
  einer Geste hängt. Ein Tastendruck ist eine Geste, aber die Ansage soll auch
  dann kommen, wenn der Browser gerade neu gestartet ist.
- `--password-store=basic`, weil Chromium ohne Desktop sonst nach einem
  Schlüsselbund sucht, den es hier nicht gibt.
- `xset s off -dpms`, damit der Bildschirm nicht abschaltet. Das Board hält ihn
  im Vollbild auch selbst wach ([screen.ts](../src/screen.ts)), aber es soll
  nicht die einzige Instanz sein, die daran denkt.

**Kein `--incognito`.** Das wäre die naheliegende Wahl für ein Gerät, das
niemandem gehört, und sie wäre fatal: die Stimme, die gespeicherten Sätze und der
Kalender liegen in der IndexedDB dieses Profils. Inkognito wirft alle drei bei
jedem Neustart weg.

Dann `reboot`. Danach kommt das Gerät ohne Zutun ins Board.

## 8 — Der Knopf

Der Lautstärkeknopf am USB des Wyse, nicht am Mac. Board offen, dann:

- **Drücken** → das Board spricht. Es hört `AudioVolumeMute` neben `Space`.
- **Drehen** → nichts passiert, und die Lautstärke bleibt, wo sie war.

Verstellt sich die Lautstärke doch, greift etwas unter dem Browser zu. Dann
`keyd` davor:

```bash
apt install keyd
```

```bash
keyd monitor
```

Das zeigt, unter welchen Namen die Tasten ankommen. Mit diesen Namen
`/etc/keyd/default.conf`:

```ini
[ids]
*

[main]
mute = space
volumeup = noop
volumedown = noop
```

Danach `systemctl enable --now keyd`. Der Knopf schickt dann die Leertaste, und
das Board braucht von seinen zusätzlichen Tasten nichts zu wissen.

## 9 — Die Termine

Zwei Wege, und sie schließen sich nicht aus:

**Jetzt sofort:** am Mac **Einstellungen → Sicherung als Datei**, die JSON auf
einen USB-Stick, am Wyse **Sicherung einlesen**. Das Einlesen fügt hinzu und
überschreibt nie ([db.ts](../src/db.ts)) — es ist also keine Entscheidung, die
etwas kostet. Der Nachteil: es ist eine Kopie, kein Abgleich.

**Danach:** den NAS-Ordner auf dem Wyse einhängen (`cifs-utils`, ein Eintrag in
`/etc/fstab`) und in **Einstellungen → Wo alles liegt** darauf zeigen. Dann ist
der Ordner die Wahrheit für beide Geräte, und was am Laptop geplant wird, steht
an der Wand — das ist die Anordnung aus
[ADR 002](decisions/002-browser-only-and-a-shared-folder.md).

Ein offener Punkt dabei: ob Chromium die Ordnerfreigabe über einen Neustart
hinweg behält oder sie einmal bestätigt haben will. `restore()` fragt nie von
sich aus, aber `confirm()` existiert für den Fall, dass der Browser die Freigabe
hat vergessen — und ein Klick, den niemand macht, ist an einer Wand ein
Ausfall. Das ist am Gerät zu messen, bevor der Ordner der einzige Weg ist.

## Was hier noch nicht steht

**Der Leser.** `tools/leser.py` ist die Brücke vom ACR122U in die Seite und
gehört als `systemd`-Dienst neben Chromium. Solange keine Karten im Spiel sind,
läuft das Board ohne ihn — die Ansage hängt nicht an ihm.

**Die Sätze als Dateien.** [speech.md](speech.md) sieht vor, dass der Laptop beim
Planen jeden Satz rendert und der Wyse nur Dateien abspielt. Gebaut ist das
nicht: die Sätze liegen in der IndexedDB des Browsers, der sie erzeugt hat, und
der geteilte Ordner trägt sie nicht. Heute synthetisiert der Wyse also selbst —
beim ersten Mal je Satz hörbar langsam auf einem J4105, danach aus dem
Zwischenspeicher. Das ist der Grund, warum die Vorbereitung dort einmal
nachgezogen werden muss, und keiner, hier auf sie zu warten.
