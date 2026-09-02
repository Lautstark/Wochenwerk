# Umzug auf wochenwerk.lautstark.tech

> Erledigt am 2. September 2026. Das hier bleibt als Beschreibung dessen, was
> geschah — und weil derselbe Weg für das nächste Produkt gilt, das eine eigene
> Adresse bekommt.

Wochenwerk wird unter `lautstark.tech/Wochenwerk/` ausgeliefert. Das ist derselbe
**Origin** wie die Übersichtsseite: ein Speicherkontingent zwischen einem Kalender
und einer Marketingseite, und ein „Websitedaten löschen" auf einer der beiden
nimmt die andere mit. Die drei anderen Produkte haben eigene Subdomains.

Der Umzug kostet fast nichts, **weil der Kalender im Ordner liegt**. IndexedDB
hängt am Origin und wäre bei einem Wechsel gestrandet; ein Ordner nicht. Vor dem
1. September 2026 wäre das ein Datenumzug gewesen, danach ist es ein Klick.

## Was vorbereitet ist

Der Build entscheidet an einer Repository-Variablen, nicht an einer Codeänderung —
denn der DNS-Eintrag muss zuerst existieren, und nichts hier kann wissen, wann.

* `PAGES_DOMAIN` **nicht gesetzt**: gebaut wird für `/Wochenwerk/`, wie bisher.
* `PAGES_DOMAIN` **gesetzt**: gebaut wird für `/`, und eine `CNAME` reist mit dem
  Artefakt.

**Die `CNAME` allein reicht nicht.** Bei Auslieferung über Actions liest Pages sie
nicht — das tut nur die alte, zweigbasierte Auslieferung. Die Domain ist eine
Einstellung des Repositorys und muss gesetzt werden (Schritt 4 unten). Die Datei
im Artefakt schadet nichts und ist da, falls die Auslieferung je zurück auf einen
Zweig wechselt.

Rückwärts geht es genauso: Domain in den Pages-Einstellungen löschen, Variable
löschen, neu bauen.

## Reihenfolge

1. **DNS anlegen.** Beim Registrar einen `CNAME` für `wochenwerk` auf
   `lautstark.github.io.` — dieselbe Form, die `bildhaft` und `mitreden` schon
   haben.
2. **Warten, bis er auflöst.** `dig +short wochenwerk.lautstark.tech` muss
   antworten. Vorher schlägt Pages' Zertifikatsausstellung fehl.
3. **Variable setzen** und neu bauen:

   ```
   gh variable set PAGES_DOMAIN --repo Lautstark/Wochenwerk --body wochenwerk.lautstark.tech
   gh workflow run pages.yml --repo Lautstark/Wochenwerk
   ```

4. **Die Domain in den Pages-Einstellungen setzen.** Das ist der Schritt, der
   wirkt:

   ```
   gh api -X PUT repos/Lautstark/Wochenwerk/pages -f cname=wochenwerk.lautstark.tech
   ```

5. **HTTPS erzwingen**, sobald das Zertifikat da ist — einige Minuten nach dem
   ersten Aufruf über die neue Adresse:

   ```
   gh api -X PUT repos/Lautstark/Wochenwerk/pages -F https_enforced=true
   ```

## Danach, einmal pro Gerät

Der Origin ist ein anderer, also ist auch der Speicher des Browsers ein anderer.
Nichts davon ist verloren — es liegt im Ordner.

* **Ordner wählen**, Einstellungen → Wo alles liegt. Der Ordner trägt die Marke,
  also wird er gelesen und der Kalender ist wieder da.
* **METACOM** findet sich von selbst, sofern er in der Ablage liegt.
* **Stimme und Azure-Schlüssel** sind Geräteeinstellungen und müssen einmal neu
  gesetzt werden. Sie stehen bewusst weder im Ordner noch in der Sicherungsdatei.
* **Die Adresse am Wandbrett** ändern. Das ist der einzige Schritt, den niemand
  aus der Ferne machen kann.

## Was nicht mit umzieht — und warum das in Ordnung ist

Der Hinweis, welchen Ordner die anderen Programme benutzen, liegt in einem Cookie
auf `.lautstark.tech` und gilt für alle Subdomains. Der überlebt den Umzug.

## Die Übersichtsseite

Ist eine eigene Entscheidung und nicht Teil davon. Eine Subdomain ist Installation;
ein Eintrag auf lautstark.tech ist die Aussage „das ist fertig genug, dass andere
es benutzen sollen". Dafür fehlen ein Zeichen wie `mark-bildhaft.svg`, ein
Bildschirmfoto und ein Text — und ein paar Wochen Benutzung, die zeigen, was noch
fehlt.
