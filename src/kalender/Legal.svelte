<script lang="ts">
  /**
   * What the footer opens: was Wochenwerk ist, das Impressum und der
   * Datenschutz. conventions.md §6.12, over `@lautstark/design/svelte/Legal`.
   *
   * ## Why this exists at all
   *
   * Wochenwerk had no footer and no legal pages. § 5 DDG asks for an Impressum
   * that is easy to find and easy to recognise, and Art. 13 DSGVO asks that
   * somebody be told what happens to their data before it happens. The other
   * three products have carried both for months; this is the fourth.
   *
   * „Impressum" keeps its German name, because § 5 DDG names the word. Nothing
   * names the privacy page, so „Datenschutz" is a choice and not an obligation.
   *
   * ## The prose is markup, not a built HTML string
   *
   * mitreden and bildhaft build these pages as HTML strings because their words
   * come out of a translation table and their pages are sentences with links
   * inside them. Wochenwerk has no i18n module and both its pages are hardcoded
   * `lang="de"`, so there is no table for a string to come out of — which
   * leaves `{@html}` buying nothing and costing the one thing it always costs.
   * This is vorlaut's shape instead: real elements, and the two addresses that
   * are not prose written where they can be read.
   *
   * ## Every claim in the Datenschutz is checked against this repository
   *
   * That is the rule these pages are written under, and it is the reason two
   * paragraphs the siblings carry are **not** here. vorlaut fetches
   * onnxruntime from jsDelivr and says so; wochenwerk bundles it
   * (`piperVendor` in vite.config.ts, `base: import.meta.env.BASE_URL` in
   * speech.ts), so there is no content delivery network in this product and no
   * paragraph about one. bildhaft and mitreden fetch a ready-made Sammlung from
   * lautstark.tech when the address ends in `?sammlung=`; wochenwerk has no such
   * link and no such fetch, so that paragraph is absent too.
   *
   * Two things are here that no sibling has: the cookie, which this product is
   * the only one that can set, and the card reader's bridge on localhost.
   *
   * ## Where the words are copied and where they are written
   *
   * The Angaben, „Haftung für Links", „Streitbeilegung", „Hosting und
   * Server-Logs", „Was nicht stattfindet" und „Deine Rechte" stand word for word
   * in all three siblings already. They are copied rather than reinvented, and
   * they keep their punctuation exactly, including the em dashes — a paragraph
   * that is identical in four products is worth more than a paragraph in one
   * house style. Everything written fresh for this product follows the house
   * voice instead: short main clauses, du throughout, and no dashes.
   */
  import Legal from "@lautstark/design/svelte/Legal";

  /* Which page is showing, or null while the dialog is closed. Two-way, because
     every way out — the ✕, Escape, a press outside — has to end with this and
     the dialog agreeing rather than one of them left behind. A string rather
     than a union of the three keys: that is the shape the shared component
     binds, and a narrower type here would only be a cast at the seam. */
  let { page = $bindable<string | null>(null) }: { page?: string | null } = $props();

  /** The one line to change if a different address should be public. */
  const EMAIL = "steffi@lautstark.tech";
  const REPO = "https://github.com/Lautstark/Wochenwerk";
  const ISSUES = "https://github.com/Lautstark/Wochenwerk/issues";

  /* In the order they are drawn, and the title is what names the dialog while
     its page is showing — §6.12's thunk, so a reader announcing the sheet says
     „Impressum" while the Impressum is up. */
  const PAGES = [
    { key: "about", title: "Was ist Wochenwerk?", id: "aboutPage" },
    { key: "impressum", title: "Impressum", id: "impressumPage" },
    { key: "privacy", title: "Datenschutz", id: "privacyPage" },
  ];
</script>

<Legal bind:page pages={PAGES} id="legal" closeLabel="Schließen">
  {#snippet children(key)}
    {#if key === "about"}
      <p>Wochenwerk ist ein Wochenplan für zu Hause. Du trägst im Kalender ein, was ansteht. Daneben steht ein Board mit Bildern, und wer eine Karte in den Leser legt, bekommt gesagt, was als Nächstes kommt.</p>
      <p>Ich habe es für meine eigene Familie gebaut. Es liegt hier, weil es anderen vielleicht auch nützt.</p>
      <h3>Was den Rechner verlässt</h3>
      <p>Deine Termine, deine Karten und deine Personen bleiben in diesem Browser oder in dem Ordner, den du selbst gewählt hast. Hinaus geht nur dreierlei: das Suchwort, wenn du ein Symbol bei ARASAAC suchst, der einmalige Download einer Stimme, und, nur mit deinem eigenen Schlüssel, der Satz an Azure. Im Datenschutz steht zu jedem davon, wohin genau.</p>
      <h3>Symbole</h3>
      <p>Die Piktogramme kommen von <a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">ARASAAC</a> und stehen unter CC BY-NC-SA. Material daraus darf nicht kommerziell verwertet werden. METACOM ist lizenzpflichtig. Wochenwerk liefert keine METACOM-Symbole mit, sondern liest deinen eigenen, lizenzierten Ordner.</p>
      <h3>Stimmen</h3>
      <p>Die mitgelieferten Stimmen sind Piper-Modelle und rechnen im Browser. Welche davon weitergegeben werden dürfen, entscheidet <a href="https://github.com/Lautstark/stimmquelle" target="_blank" rel="noreferrer noopener">stimmquelle</a>, damit keine Stimme mit unklarer Lizenz auf einem Gerät landet. Die Stimmen deines Geräts stehen auch zur Wahl. Trägst du einen eigenen Azure-Schlüssel ein, kommen die von Microsoft dazu.</p>
      <h3>Quellcode und Schwesterprojekte</h3>
      <p>Wochenwerk ist quelloffen unter der MIT-Lizenz: <a href={REPO} target="_blank" rel="noreferrer noopener">github.com/Lautstark/Wochenwerk</a>. Die übrigen Werkzeuge liegen unter <a href="https://github.com/Lautstark" target="_blank" rel="noreferrer noopener">Lautstark</a>. <a href="https://lautstark.github.io/mitreden/" target="_blank" rel="noreferrer noopener">mitreden</a> macht aus einem Satz eine Audiodatei, damit alle Geräte dieselbe Stimme haben. <a href="https://lautstark.github.io/bildhaft/" target="_blank" rel="noreferrer noopener">bildhaft</a> macht aus getippten Sätzen Symbolreihen zum Ausdrucken.</p>

    {:else if key === "impressum"}
      <h3>Angaben gemäß § 5 DDG</h3>
      <!-- Name, street, town and country as four lines, because that is what a
           postal address is. -->
      <p>Stefanie Grewenig<br />Talheide 5<br />21149 Hamburg<br />Deutschland</p>
      <h3>Kontakt</h3>
      <p>E-Mail: <a href="mailto:{EMAIL}">{EMAIL}</a><br />Fehler und Fragen auch öffentlich: <a href={ISSUES} target="_blank" rel="noreferrer noopener">github.com/Lautstark/Wochenwerk/issues</a></p>
      <h3>Verantwortlich für den Inhalt</h3>
      <p>Stefanie Grewenig, Anschrift wie oben.</p>
      <h3>Piktogramme, Stimmen und Quellcode</h3>
      <p>Wochenwerk ist ein privates, nicht kommerzielles Projekt. Der Quellcode steht unter der MIT-Lizenz. Die Piktogramme stammen von <a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">ARASAAC</a> (CC BY-NC-SA, Autor: Sergio Palao, Urheber: Regierung von Aragón) und sind nicht Teil dieser Software. METACOM-Symbole werden weder mitgeliefert noch übertragen. Die mitgelieferten Stimmen stammen aus dem <a href="https://github.com/rhasspy/piper" target="_blank" rel="noreferrer noopener">piper-Projekt</a> und tragen ihre eigenen freien Lizenzen.</p>
      <h3>Haftung für Links</h3>
      <p>Für die Inhalte verlinkter externer Seiten sind deren Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren dort keine Rechtsverstöße erkennbar.</p>
      <h3>Streitbeilegung</h3>
      <p>Zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle bin ich weder verpflichtet noch bereit.</p>

    {:else}
      <!-- Every paragraph below answers a path that exists in this repository.
           What is deliberately missing is named in the header of this file. -->
      <p>Wochenwerk läuft vollständig in deinem Browser. Es gibt keinen Server von mir, keine Konten, keine Auswertung und keine Werbung. Deine Termine, deine Karten und deine Personen gehen nicht an mich. Ich kann sie nicht sehen, auch nicht auf Nachfrage.</p>
      <h3>Verantwortliche</h3>
      <p>Stefanie Grewenig, Talheide 5, 21149 Hamburg, Deutschland<br /><a href="mailto:{EMAIL}">{EMAIL}</a></p>
      <h3>Hosting und Server-Logs</h3>
      <p>Die Seite wird von GitHub Pages ausgeliefert (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA). Beim Abruf verarbeitet GitHub technisch notwendige Zugriffsdaten, darunter deine IP-Adresse, Zeitpunkt, aufgerufene Datei und Browserkennung. Ich habe darauf keinen Zugriff und erhalte keine Statistiken. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO — das berechtigte Interesse, die Seite überhaupt ausliefern zu können. Die Übermittlung in die USA stützt sich auf das EU-US Data Privacy Framework, unter dem GitHub zertifiziert ist.</p>
      <h3>Suche bei ARASAAC</h3>
      <p>Suchst du ein Symbol, schickt dein Browser das Suchwort an die öffentliche Schnittstelle von <a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">arasaac.org</a> (Regierung von Aragón, Spanien) und lädt die gefundenen Bilder von dort. Dabei wird technisch bedingt deine IP-Adresse übertragen. Ganze Termine oder Sätze werden nicht übertragen. Antworten und Bilder werden im Browser zwischengespeichert, ein Wort geht also einmal hinaus statt bei jedem Öffnen; nach 30 Tagen kann es erneut angefragt werden. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO — ohne diese Anfrage gibt es keine Symbole. Spanien liegt in der EU, es findet keine Drittlandübermittlung statt.</p>
      <h3>METACOM aus deinem eigenen Ordner</h3>
      <p>Legst du deinen lizenzierten METACOM-Ordner an, liest Wochenwerk ihn über die Dateisystem-Schnittstelle deines Browsers. Aus diesem Ordner geht nichts hinaus. Die Bilder werden angezeigt und an niemanden übertragen, auch nicht an mich.</p>
      <h3>Stimmen von Hugging Face</h3>
      <p>Wählst du eine mitgelieferte Stimme oder hörst sie an, lädt dein Browser das Modell einmalig von huggingface.co (Hugging Face, Inc., 20 Jay Street, Brooklyn, NY 11201, USA). Das sind rund 63 MB. Übertragen wird dabei deine IP-Adresse, kein Inhalt. Rechtsgrundlage ist deine Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO, die du mit dem Anhören oder dem Auswählen gibst. Danach liegt das Modell auf deinem Gerät und gesprochen wird ohne Netz. Die Programmbibliothek, die das Modell rechnen lässt, liegt in dieser Seite selbst; dafür wird nichts nachgeladen.</p>
      <h3>Stimmen deines Geräts</h3>
      <p>Du kannst auch eine Stimme wählen, die dein Browser mitbringt. Manche davon rechnen nicht auf dem Gerät, sondern beim Hersteller des Browsers. Dann geht der zu sprechende Satz dorthin, und dafür ist dieser Hersteller dir gegenüber verantwortlich. Die Liste sagt bei jeder Stimme dazu, wenn sie das Netz braucht.</p>
      <h3>Azure Speech, nur mit eigenem Schlüssel</h3>
      <p>Trägst du einen eigenen Azure-Schlüssel ein, geht der zu sprechende Satz von deinem Browser direkt an Microsofts Sprachdienst und kommt als Ton zurück. Das ist dein Vertragsverhältnis mit Microsoft, als Inhaberin oder Inhaber des Kontos. Rechtsgrundlage hier ist deine Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO, die du durch Entfernen des Schlüssels jederzeit widerrufen kannst. Der Schlüssel selbst bleibt in diesem Browser und wird an niemanden sonst übertragen. Ab Werk ist das aus.</p>
      <h3>Der Ordner, in dem der Kalender liegt</h3>
      <p>Du kannst einen Ordner wählen, in dem die Termine liegen sollen, damit mehrere Geräte im Haushalt denselben Kalender sehen. Dieser Ordner ist deiner. Ich erfahre nicht, welcher es ist, und nichts daraus geht an mich. Liegt er in einem Dienst, der ihn mit der Cloud abgleicht, gilt für seinen Inhalt das, was dieser Dienst sagt. Dasselbe gilt für den Ordner, in den die Sicherungskopie geschrieben wird.</p>
      <h3>Der Kartenleser am Board</h3>
      <p>Steckt ein Kartenleser am Rechner, fragt das Board einen kleinen Dienst auf demselben Rechner, welche Karte gerade im Leser liegt. Diese Verbindung geht an localhost und nie ins Internet. Der Kalender fragt ihn gar nicht.</p>
      <h3>Speicherung auf deinem Gerät</h3>
      <p>Deine Termine, Serien, Karten, Personen, Einstellungen, ein eingetragener Azure-Schlüssel, die bereits gesprochenen Ansagen und die zwischengespeicherten ARASAAC-Symbole liegen in der lokalen Datenbank deines Browsers (IndexedDB). Geladene Stimmmodelle liegen im privaten Dateispeicher des Browsers (OPFS), deine Wahl für Hell oder Dunkel in localStorage. Alles davon bleibt dort, bis du es löschst, unter „Einstellungen → Alle Daten löschen“ oder über die Browserfunktion zum Löschen von Websitedaten. Diese Speicherung ist für die von dir ausdrücklich gewünschte Funktion unbedingt erforderlich und daher nach § 25 Abs. 2 Nr. 2 TDDDG einwilligungsfrei.</p>
      <h3>Ein Cookie, und nur wenn du es einschaltest</h3>
      <p>Neben dem Ordner, den du gewählt hast, steht ein Schalter. Schaltest du ihn ein, legt Wochenwerk ein Cookie namens „lautstark-ordner“ an. Darin stehen zwei Dinge: der Name des Ordners und der Name des Programms. Es ist dafür da, dass die anderen Lautstark-Programme auf diesem Gerät denselben Ordner vorschlagen können, statt noch einmal danach zu fragen. Rechtsgrundlage ist deine Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG. Schaltest du den Schalter wieder aus, wird das Cookie gelöscht. Ein Banner gibt es deshalb trotzdem nicht: alles andere ist unbedingt erforderlich, und dieses eine schaltest du selbst ein, an der Stelle, an der du weißt, was es bedeutet.</p>
      <h3>Was nicht stattfindet</h3>
      <p>Keine Analyse- oder Trackingdienste, keine Werbenetzwerke, keine Social-Media-Plugins, keine Schriftarten von fremden Servern, keine Weitergabe von Daten an Dritte, keine automatisierte Entscheidungsfindung oder Profilbildung.</p>
      <h3>Deine Rechte</h3>
      <p>Dir stehen die Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO) zu. Da mir keine personenbezogenen Daten von dir vorliegen, wird eine Auskunft in der Regel ergebnislos bleiben. Beschweren kannst du dich bei jeder Aufsichtsbehörde, für mich zuständig ist der Hamburgische Beauftragte für Datenschutz und Informationsfreiheit.</p>
      <p class="stand">Stand: September 2026</p>
    {/if}
  {/snippet}
</Legal>
