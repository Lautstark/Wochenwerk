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
cd ~/Downloads && curl -fLO "https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/$(curl -sL https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/ | grep -oE 'debian-[0-9.]+-amd64-netinst\.iso' | head -1)"
```

Die Nummer wird geholt statt hier hingeschrieben, weil Debian etwa alle zwei
Monate ein Punktrelease herausgibt und `current/` dann nur noch das neue enthält.
Eine feste Nummer in dieser Datei ist also keine Genauigkeit, sondern ein
404 mit Verfallsdatum — diese Anleitung ist in den ersten zehn Tagen einmal
hineingelaufen.

Die Prüfsumme kommt aus derselben Quelle wie das Abbild, und deshalb prüft sie
den Transportweg und nicht die Herkunft:

```bash
cd ~/Downloads && iso=$(ls -t debian-*-amd64-netinst.iso | head -1) && curl -sL https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/SHA256SUMS | grep " $iso$" | shasum -a 256 -c
```

Kommt dort nicht `OK`, ist die Datei unterwegs kaputtgegangen — noch einmal
laden, nicht weitermachen. Sonst merkst du es erst, wenn der Wyse nicht bootet,
und suchst den Fehler im BIOS.

Dann den Stick beschreiben. **Der Datenträgername muss stimmen**, sonst
überschreibt der Befehl die falsche Platte: erst auflisten, den Stick an seiner
Größe erkennen, dann die Nummer einsetzen.

```bash
diskutil list external
```

```bash
cd ~/Downloads && iso=$(ls -t debian-*-amd64-netinst.iso | head -1) && diskutil unmountDisk /dev/diskN && sudo dd if="$iso" of=/dev/rdiskN bs=4m status=progress
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

Der Standardweg, mit vier Entscheidungen, auf die es ankommt:

- **Tastaturbelegung**: die, die deine Tastatur *körperlich* hat. Das ist keine
  Geschmacksfrage, sondern die Stelle, an der diese Installation am teuersten
  scheitert: unter deutscher Belegung mit einer US-Tastatur wird aus dem Minus
  ein `ß`, `y` und `z` tauschen die Plätze, und jeder Befehl auf der Notkonsole
  antwortet nur mit seiner Hilfeseite. Schlimmer ist, was du dabei *nicht* siehst
  — ein Passwort wird als Sternchen angezeigt und landet verdreht in der
  Datenbank. Wer es merkt, nachdem der Installer weitergelaufen ist, geht mit
  `<Zurück>` ins Hauptmenü und ruft **Tastatur konfigurieren** und danach
  **Benutzer und Passwörter einrichten** noch einmal auf.
- **Netzwerk**: das WLAN im Installationsprogramm auswählen und die Zugangsdaten
  eintragen. Es schreibt sie nach `/etc/network/interfaces` und
  `/etc/wpa_supplicant/`, und damit steht das WLAN nach jedem Neustart von selbst.
- **Rechnername**: `wochenwerk`. Benutzer ebenfalls `wochenwerk` — die Anleitung
  unten setzt diesen Namen ein.
- **Software-Auswahl** (`tasksel`): **Desktop-Umgebung abwählen**, *SSH server*
  und *standard system utilities* anwählen. Der SSH-Server ist der Grund, dass du
  den Rest vom Mac aus tippen kannst statt vor der Wand zu stehen.

### Wenn der Spiegelserver „ungültig" heißt

`Ungültiger Archiv-Spiegel` bedeutet fast nie, dass mit dem Spiegel etwas ist.
Bevor du einen anderen probierst, miss nach: **Alt+F2**, Enter, und dort

```
wget http://deb.debian.org/debian/dists/trixie/Release
```

Lädt das durch — und das tut es meistens —, dann ist Netz, DNS, Route und Uhr in
Ordnung, und der Fehler steckt im Installer. Der häufigste Grund ist dann das
**Proxy-Feld**: der Installer schickt jeden Abruf durch einen dort eingetragenen
Proxy, die Notkonsole nicht. Ein einzelnes hineingerutschtes Zeichen, und alles
scheitert außer dem Test, den du gerade gemacht hast. Feld mit Backspace
durchwischen, auch wenn es leer aussieht.

Hilft das nicht, hör auf zu suchen: **„Einen Netzwerk-Spiegel verwenden?" →
„Nein"**. Das Grundsystem liegt vollständig auf dem Stick. Du verlierst dabei
nur `openssh-server`, und den holst du nach dem ersten Start an der Konsole nach
— siehe unten.

### Hineinkommen

`wochenwerk.local` funktioniert **noch nicht**: der Name braucht `avahi-daemon`,
und eine Installation ohne Desktop bringt ihn nicht mit. Also an der Konsole
anmelden und die Adresse ablesen:

```
hostname -I
```

Und vom Mac aus mit dieser Adresse hinein:

```bash
ssh wochenwerk@192.168.0.171
```

Wurde ohne Netzwerk-Spiegel installiert, fehlt dort noch der SSH-Server. Dann
zuerst an der Konsole, als `root` (`su -`):

```
echo "deb http://deb.debian.org/debian trixie main non-free-firmware" > /etc/apt/sources.list
echo "deb http://deb.debian.org/debian trixie-updates main non-free-firmware" >> /etc/apt/sources.list
echo "deb http://security.debian.org/debian-security trixie-security main non-free-firmware" >> /etc/apt/sources.list
apt update && apt install openssh-server avahi-daemon
```

Danach stimmt auch `wochenwerk.local`, und der Rest dieser Anleitung läuft vom
Mac aus.

## 4 — Was das Gerät braucht

Als `root` (`su -`):

```bash
apt update && apt install --no-install-recommends xserver-xorg xinit x11-xserver-utils chromium unclutter pipewire pipewire-pulse wireplumber alsa-utils
```

`--no-install-recommends` ist hier keine Sparsamkeit um ihrer selbst willen: die
Empfehlungen ziehen einen halben Desktop nach, und mit ihm die Dienste, die
Medientasten abfangen.

## 5 — Ton

**Das hier kostet einen halben Tag, wenn man es rät statt misst.** Die Kette hat
vier Stufen, und drei davon standen bei der ersten Einrichtung falsch, ohne dass
irgendwo ein Fehler erschien — es war nur leise.

### Zuerst messen, wohin der Ton überhaupt geht

Nicht „hört man etwas", sondern: welches Gerät öffnet der Browser? Während eine
Ansage läuft:

```
for p in /proc/[0-9]*; do for fd in $p/fd/*; do t=$(readlink "$fd" 2>/dev/null) || continue; case "$t" in /dev/snd/*) echo "$(cat $p/comm) -> $t";; esac; done; done | sort -u
```

Steht dort `pcmC0D0p`, geht der Ton auf die **Klinkenbuchse**. `pcmC0D3p` ist der
erste HDMI-/DisplayPort-Ausgang, also der Monitor. Das war hier der ganze Fehler:
der Ton lief auf eine Buchse, an der nichts hing, und was zu hören war, war
Übersprechen.

### Das Profil der Soundkarte

PipeWire bietet nur an, was das Profil freischaltet, und die Vorgabe ist „nur
analog" — der DisplayPort-Ausgang taucht in `wpctl status` dann gar nicht erst
auf. Profile anzeigen und umstellen:

```
wpctl status
pw-cli enum-params <geräte-id> EnumProfile | grep -E '^\s+(Int|String) ' | paste - - - -
wpctl set-profile <geräte-id> 4
```

Index 4 ist `output:hdmi-stereo`, der *erste* HDMI-Ausgang — der, der `pcmC0D3p`
entspricht. Danach erscheint die Senke „Digital Stereo (HDMI)", und erst dann
lohnt es sich, an Lautstärken zu drehen.

```
wpctl set-default <senken-id>
wpctl set-volume <senken-id> 1.4
```

Über 1.0 verstärkt PipeWire in Software. 1.4 trägt Sprache durch einen Raum, ohne
zu verzerren; wo es rau wird, ist 1.2 die sichere Grenze.

### Die Lautstärke des Monitors, ohne an seine Knöpfe zu kommen

Im Rahmen sind die Tasten des Bildschirms nicht mehr erreichbar — und ausgerechnet
dort stand die Lautstärke auf **20 von 100**. Bildschirme nehmen Steuerbefehle
aber über dieselbe Leitung entgegen, über die sie ihr Bild bekommen:

```
sudo apt install ddcutil
sudo modprobe i2c-dev && echo i2c-dev | sudo tee /etc/modules-load.d/i2c-dev.conf
sudo usermod -aG i2c $USER
ddcutil detect
ddcutil getvcp 62     # Lautstärke lesen
ddcutil setvcp 62 100 # und aufdrehen
```

Damit ist das ganze Monitormenü von der Kommandozeile aus erreichbar, nicht nur
die Lautstärke — Helligkeit ist `10`, Kontrast `12`, Eingangswahl `60`. Für ein
Gerät, dessen Bedienknöpfe hinter Holz liegen, ist das keine Spielerei, sondern
die einzige Tür.

### Was hier *nicht* hilft

Eine `~/.asoundrc` mit `softvol` oder einem LADSPA-Kompressor: sobald PipeWire
läuft, redet Chromium mit PipeWire und nicht mit ALSA, und die Datei ist
wirkungslos. Sie wurde hier gebaut, bevor gemessen war, wohin der Ton geht — und
wieder entfernt, weil eine Stufe, die nichts tut, die nächste Person kostet, die
das Gerät verstehen will.

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
