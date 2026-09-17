<script lang="ts">
  /* One panel open at a time, and the state in the heading so the column reads as a
     list of answers rather than a scroll through everything anybody has opened.
     `name=` is the platform's own accordion. conventions.md §3.5, and the markup
     is @lautstark/design/svelte/Panel's — §6.2. */
  import { onDestroy } from "svelte";
  import { applyTheme, readTheme, saveTheme, THEMES, type Theme } from "@lautstark/design/theme";
  import { listVoices } from "@lautstark/stimmquelle";
  import { wherePanel } from "@lautstark/sicherung/ablage-panel";
  import { backupPanel } from "@lautstark/sicherung/backup-panel";
  import { metacomPanel } from "@lautstark/bildquelle/metacom-panel";
  import { voicePicker } from "@lautstark/stimmquelle/voice-picker";
  import { downloadJson } from "@lautstark/werkzeuge/download";
  import type { AblageStatus } from "@lautstark/sicherung/ablage";
  import { standing } from "../announce.js";
  import { hearSample, prepare } from "../speech.js";
  import { pickFile } from "../ui.js";
  import { dayLabel, type Card, type Person } from "../model.js";
  import { adoptFolder, clearAll, clearAppointments, countAll, exportAll, importAll, isBackup, removeCard, removePerson, saveAzure, saveSettings, saveVoice, settings, uuid, wipeReaches } from "../db.js";
  import { metacom, preferredRendering, preferRendering, renderings, sourceInUse, useFolder } from "../symbols.js";
  import { caveats, labelOf, nameOf, offered, type Voice } from "../voices.js";
  import { load, shown } from "../store.svelte.js";
  import { ablage as ablageStore, folders, HOME, isStore, metacomInFolder, stopTelling, tellOthers } from "../folder.js";
  import { backup } from "../backup.js";
  import { confirmDialog, openDialog } from "../views/dialog.js";
  import type { SettingsState } from "./settings.svelte.js";
  import Vanilla from "@lautstark/design/svelte/Vanilla";
  import Panel from "@lautstark/design/svelte/Panel";
  import Row from "../pieces/Row.svelte";
  import Overflow from "../pieces/Overflow.svelte";
  import Dropdown from "../pieces/Dropdown.svelte";
  import Picture from "../pieces/Picture.svelte";
  import Face from "../pieces/Face.svelte";
  import CardEditor from "./CardEditor.svelte";
  import PersonEditor from "./PersonEditor.svelte";

  let { s }: { s: SettingsState; handle: unknown } = $props();
  const say = s.say;

  /**
   * Which panel stands open, one field per panel.
   *
   * Everything folded on arrival, which is what this dialog has always opened
   * as. §3.11's „Sprache first and the only one open" is about a language
   * setting and this product has none — no i18n module, both pages hardcoded
   * `lang="de"` — so there is nothing for it to name, and conventions.md §6.2
   * says so in as many words.
   *
   * Bound rather than passed one way, and that is a correctness matter rather
   * than a style. `name="settings"` is the platform's own accordion: opening
   * one panel makes the browser remove another's `open` attribute *itself*, and
   * Svelte never sees it happen. A one-way prop would leave this record saying
   * „open" about a panel the browser has folded, and the next write of `true`
   * would short-circuit against that record without reaching the DOM.
   */
  const unfolded = $state({
    ablage: false, sicherung: false, symbole: false, stimme: false, sprachdienst: false,
    karten: false, personen: false, aussehen: false, loeschen: false,
  });

  /**
   * Azure's own region names. A datalist suggests rather than restricts, so a
   * region newer than this file still works by typing it — and the region is what
   * a rejected key usually turns out to be.
   */
  const AZURE_REGIONS = [
    "westeurope", "northeurope", "germanywestcentral", "switzerlandnorth",
    "francecentral", "uksouth", "swedencentral", "norwayeast", "eastus", "eastus2",
    "westus", "westus2", "westus3", "centralus", "southcentralus", "canadacentral",
    "brazilsouth", "australiaeast", "southeastasia", "eastasia", "japaneast",
    "japanwest", "koreacentral", "centralindia", "southafricanorth", "uaenorth",
  ];

  /* localStorage, like the three siblings: the scheme has to be readable before
     the first paint, and a database read is a frame too late. kalender/index.html
     reads this same key inline. */
  const THEME_KEY = "wochenwerk.theme";
  const THEME_WORDS: Record<Theme, string> = { system: "Wie das Gerät", light: "Hell", dark: "Dunkel" };

  type Azure = { key: string; region: string };
  type Answer = { ok: true; count: number } | { ok: false; code: "unreachable" | "refused" | "failed"; words: string };

  /**
   * Whether Azure answers for this key and this region. „Gespeichert" describes
   * the database; the person who typed a key wants to know whether Microsoft
   * answers, and each way it does not points somewhere different.
   */
  async function probeAzure(azure: Azure): Promise<Answer> {
    try {
      return { ok: true, count: (await listVoices({ lang: "de", azure })).length };
    } catch (error) {
      const words = error instanceof Error ? error.message : String(error);
      const code = error instanceof TypeError ? "unreachable"
        : /rejected the key|401|403/.test(words) ? "refused" : "failed";
      return { ok: false, code, words };
    }
  }

  /* The package answers with a shape and never with words; these are ours. */
  const ablageStatus = (): AblageStatus => ablageStore.status;
  function whereSays(status: AblageStatus): string {
    switch (status.kind) {
      case "unsupported": return "Dieser Browser kann keinen Ordner öffnen.";
      case "off": return "Kein Ordner — der Kalender liegt nur hier.";
      case "idle": return `Ordner „${status.folder}“.`;
      case "saving": return "Wird geschrieben …";
      case "needs-permission": return `Der Browser braucht die Erlaubnis für „${status.folder}“ erneut.`;
      case "failed": return `Der Ordner ließ sich nicht schreiben: ${status.reason}`;
      case "stale": return `„${status.folder}“ ist nicht erreichbar. Der Kalender zeigt den letzten Stand und nimmt nichts an.`;
      case "conflicted": return `${status.ids.length} Datei(en) liegen zweimal.`;
    }
  }
  /* „1 Termin" / „14 Termine" / „keine Termine". Zero gets a word rather than a
     digit, because „0 Karten werden gelöscht" is a sentence about nothing. */
  const count = (many: number, one: string, more: string) =>
    many === 0 ? `keine ${more}` : many === 1 ? `1 ${one}` : `${many} ${more}`;
  const folderName = (status: AblageStatus) => "folder" in status ? status.folder : "";

  /* Bumped after every act that may have moved something the panels read from
     outside the store — the folder's status, the provider, the renderings. */
  let stamp = $state(0);
  const moved = () => { stamp += 1; };

  /* What can be spoken with is asked on every opening rather than held in a
     module: a key typed in the meantime, or a voice the operating system has just
     installed, should show up without reloading the page. */
  let voices = $state<Voice[]>([]);
  let chosen = $state<string | undefined>(undefined);
  /* Until the catalogue is answered the heading says it is loading rather than
     saying „keine gewählt" — an empty list is an answer, and it was giving the
     wrong one for as long as the catalogue took to arrive. */
  let loaded = $state(false);
  /* Said rather than swallowed: stimmquelle throws on a key it cannot use, so the
     list is asked for a second time without the key. */
  let refused = $state("");
  let told = $state(false);
  let keepingState = $state("");
  let symbolsState = $state("");
  /* The name of the folder METACOM was found in, and what a fruitless look
     turned up — both only until the next act, because both are answers to a
     question somebody just asked. */
  let fromFolder = $state<string | null>(null);
  let looked = $state<string[] | null>(null);
  /* A card and a person are edited inside the panel that lists them, not in a sheet
     over this one. */
  let editingCard = $state<Card | null>(null);
  let editingPerson = $state<Person | null>(null);
  let azure = $state<Azure | undefined>(undefined);
  let azureLoaded = $state(false);
  let probe = $state("");
  let key = $state("");
  let region = $state("westeurope");
  let checking = $state(false);
  let theme = $state<Theme>(readTheme(THEME_KEY));

  const run = async (work: () => Promise<unknown>, done: string) => {
    try { await work(); if (done) say(done); }
    catch (error) { say(`Das ging nicht: ${(error as Error)?.message ?? "unbekannter Fehler"}`); }
    await load();
    moved();
  };

  /* The three shared panels and the picker, built once and disposed with the
     sheet: each subscribes to something, and one built inside a render would
     subscribe again on every repaint — the leak three of the four products
     shipped, which is why the shared ones hand back a `dispose` at all. */
  const store = wherePanel({
    store: ablageStore,
    adopt: adoptFolder,
    changed: () => void load().then(moved),
    say,
    share: {
      reads: () => told,
      write: async (on: boolean) => {
        told = on;
        await saveSettings({ tellOthers: on });
        if (on) tellOthers(folderName(ablageStatus()));
        else stopTelling();
      },
    },
  });
  const keepingPanel = backupPanel({
    backup, say,
    /* The module answers '' where there is no folder — deliberately, because it
       has nothing to name. The fallback is the product's and says what is true in
       both of the blank cases: no folder chosen, and no picker in this browser. */
    headline: text => { keepingState = text || "Nur von Hand"; },
  });
  const symbolsPanel = metacomPanel({
    metacom,
    headline: text => { symbolsState = text || "Von ARASAAC"; },
    after: async action => {
      /* Both of this panel's own scraps of memory are answers to „is METACOM
         sitting in the Ablage?", and any act on the shared block has just made
         them stale. `fromFolder` survives „Neu einlesen" alone. */
      if (action !== "reread") fromFolder = null;
      looked = null;
      await load();
      moved();
    },
    say,
  });
  const picker = voicePicker({
    voices: () => voices,
    current: () => chosen,
    pick: id => { if (id && id !== chosen) void choose(id); },
    hear: async (voice, onProgress) => {
      try { await hearSample(voice.id, onProgress); }
      catch (error) { say(`${labelOf(voice, voices)} konnte nicht sprechen: ${(error as Error)?.message ?? "unbekannter Fehler"}`); }
    },
    notes: voice => caveats(voice as Voice),
  });
  onDestroy(() => { keepingPanel?.dispose(); symbolsPanel.dispose(); picker.dispose(); });
  $effect(() => { void voices; void chosen; void loaded; picker.refresh(); });
  $effect(() => { void stamp; void told; store.refresh(); });

  /* Choosing writes. There is no pending state and no Save: the panel's heading
     is what stands in the settings record, the way every other panel's is. */
  async function choose(id: string) {
    chosen = id;
    await run(() => saveVoice(id), `Der Kalender spricht jetzt mit ${nameOf(voices, id) || "dieser Stimme"}.`);
    /* The sentences that belong to no appointment have no other moment to be
       prepared in. Choosing a voice is the one a household waits through on
       purpose, and every one of them changes with it. */
    void prepare(standing());
    void readTelling();
  }
  /* The switch reflects what was chosen, and every start says it again: a cookie
     can expire or be cleared, and the household's answer lives in the settings
     rather than in the cookie it produces. */
  async function readTelling() {
    told = !!(await settings()).tellOthers;
    if (told && isStore()) tellOthers(folderName(ablageStatus()));
  }
  async function readVoices() {
    chosen = (await settings()).voice;
    try {
      voices = await offered();
      refused = "";
    } catch (error) {
      refused = (error as Error)?.message ?? "unbekannter Fehler";
      voices = await offered(false).catch(() => []);
    }
    loaded = true;
  }

  const wording = (answer: Answer) => answer.ok
    ? `${answer.count} ${answer.count === 1 ? "Stimme" : "Stimmen"} verfügbar`
    : answer.code === "unreachable" ? "Die Region antwortet nicht — stimmt der Regionsname?"
      : answer.code === "refused" ? "Azure nimmt den Schlüssel nicht an."
        : "Die Abfrage ist fehlgeschlagen — später noch einmal versuchen.";

  /* Drawn on opening and after a save or a forget, and deliberately not on every
     act: this panel holds a field somebody is typing into. `known` is the answer a
     save has just had; Azure would say the same thing twice. */
  async function drawSpeech(known?: Answer) {
    azure = (await settings()).azure;
    azureLoaded = true;
    key = "";
    region = azure?.region ?? "westeurope";
    if (!azure) { probe = ""; return; }
    if (known) { probe = wording(known); return; }
    probe = "Frage Azure …";
    probe = wording(await probeAzure(azure));
  }

  /* Checked before it is stored, so a typo is a sentence now rather than a silent
     appointment later. */
  async function keep() {
    /* An untouched field must not mean „kein Schlüssel": a save that only moves
       the region keeps the key it already has. Removing it is its own button. */
    const typed = key.trim() || (await settings()).azure?.key;
    if (!typed) return say("Erst einen Schlüssel eintippen.");
    const where = region.trim() || "westeurope";
    checking = true;
    try {
      const answer = await probeAzure({ key: typed, region: where });
      if (!answer.ok) {
        /* A key belongs to one region, and the wrong pairing answers exactly the
           same 401 as a wrong key — saying which is more use than repeating Azure. */
        const why = answer.code === "refused"
          ? "Azure hat den Schlüssel abgelehnt. Meistens ist es die Region: sie muss die der Speech-Ressource sein, nicht die deines Kontos."
          : answer.code === "unreachable" ? "Die Region antwortet nicht — stimmt der Regionsname?"
            : `Azure hat nicht geantwortet (${answer.words}).`;
        probe = why;
        return say(`Hat nicht geklappt: ${why}`);
      }
      await saveAzure({ key: typed, region: where });
      say(`Azure Speech freigeschaltet — ${answer.count} Stimmen stehen zur Wahl.`);
      await drawSpeech(answer);
      /* And the list of voices, which is the whole reason somebody typed a key. */
      await readVoices();
    } catch (error) {
      say(`Hat nicht geklappt: ${(error as Error)?.message ?? "unbekannter Fehler"}`);
    } finally {
      checking = false;
    }
  }
  async function forgetKey() {
    await saveAzure(undefined);
    say("Azure Speech wieder abgeschaltet.");
    await drawSpeech();
    await readVoices();
  }

  const eraseCard = async (card: Card) => {
    if (await confirmDialog({ title: "Karte entfernen", body: `„${card.name}“ wird entfernt. Termine, die sie zur Wahl stellen, verlieren sie.`,
      confirmLabel: "Entfernen", danger: true })) {
      await run(() => removeCard(card.id), "Karte entfernt.");
    }
  };
  const erasePerson = async (person: Person) => {
    if (await confirmDialog({ title: "Person entfernen", body: `${person.name} wird entfernt. Termine bleiben, verlieren aber diese Person.`,
      confirmLabel: "Entfernen", danger: true })) {
      await run(() => removePerson(person.id), "Person entfernt.");
    }
  };
  /* What goes, counted, and how far it goes. §4.3 asks a destructive confirmation
     to name the count and what does not come back. */
  const wipe = async (everything: boolean) => {
    const reach = wipeReaches();
    const named = folderName(ablageStatus());
    if (reach === "unreachable") {
      const sheet = openDialog({
        title: "Geht gerade nicht",
        body: [`Der Ordner „${named}“ antwortet nicht. Löschen würde nur diesen Browser leeren — `
          + `der Ordner behielte alles und gäbe es beim nächsten Start zurück. `
          + `Verbinde den Ordner wieder und versuch es dann.`],
        footer: [Object.assign(document.createElement("button"), { className: "btn primary", type: "button", textContent: "Verstanden", onclick: () => sheet.close() })],
      });
      return;
    }
    const counted = await countAll();
    const list = everything
      ? [count(counted.termine, "Termin", "Termine"), count(counted.karten, "Karte", "Karten"),
         count(counted.personen, "Person", "Personen")].join(", ")
      : count(counted.termine, "Termin", "Termine");
    const far = reach === "folder"
      ? ` Auch im Ordner „${named}“, und damit auf jedem Gerät, das ihn benutzt.`
      : "";
    if (await confirmDialog({
      title: everything ? "Alle Daten löschen" : "Alle Termine löschen",
      body: everything
        ? `${list} werden gelöscht.${far} Das lässt sich nicht rückgängig machen.`
        : `${list} werden gelöscht. Karten und Personen bleiben.${far}`,
      confirmLabel: everything ? "Alles löschen" : "Termine löschen", danger: true,
      /* Only the total asks for a word, and it is the only act in this product
         that does. */
      ...(everything ? { requireTyping: "löschen", typingLabel: "Tipp „löschen“, um zu bestätigen" } : {}),
    })) {
      await run(() => everything ? clearAll() : clearAppointments().then(() => undefined), "Gelöscht.");
    }
  };

  async function lookForMetacom() {
    await run(async () => {
      const found = await metacomInFolder();
      looked = found ? null : await folders();
      if (found) { await useFolder(found.handle); fromFolder = found.name; looked = null; }
    }, "");
  }

  /* Which fassung of a doubled symbol the search should offer first. Only when the
     folder holds more than one — a list with one answer is a question that should
     not have been asked. */
  let found = $derived.by(() => { void stamp; return renderings(); });
  const namedRendering = (segment: string | null) => segment === null ? "Keine Vorgabe"
    : `${segment} · ${found.find(entry => entry.segment === segment)?.count ?? 0} Symbole`;
  const chooseRendering = (segment: string | null) => () => void run(async () => {
    /* Told to the provider and written down, in that order. */
    preferRendering(segment);
    await saveSettings({ metacomRendering: segment ?? undefined });
  }, segment ? `Darstellung „${segment}“ wird bevorzugt.` : "Keine Darstellung mehr bevorzugt.");

  let ready = $derived.by(() => { void stamp; return metacom.isReady(); });
  let connected = $derived.by(() => { void stamp; return isStore(); });
  let where = $derived.by(() => { void stamp; return ablageStatus(); });
  let cardList = $derived([...shown().cards.values()]);
  let people = $derived(shown().people);
  let namedVoice = $derived(nameOf(voices, chosen));

  void drawSpeech();
  void readVoices();
  void readTelling();
  void sourceInUse;
</script>

<Panel section="Ablage" state={whereSays(where)} class="panel__body" bind:open={unfolded.ablage}><Vanilla node={store.node} /></Panel>
<Panel section="Sicherung" state={keepingState || "Nur von Hand"} class="panel__body" bind:open={unfolded.sicherung}>{#if keepingPanel}<Vanilla node={keepingPanel.node} /><hr class="hair" />{/if}<p class="small muted">Eine Momentaufnahme. Sie altert — übersteht aber einen Fehler, den der Ordner sofort mitmacht.</p><div class="acts"><button class="btn sm" type="button" onclick={() => void run(async () => {
      const made = await exportAll();
      const day = new Date().toISOString().slice(0, 10);
      downloadJson(made, `wochenwerk-sicherung-${day}.json`);
    }, "Sicherung geschrieben.")}>Sicherung als Datei</button><button class="btn sm quiet" type="button" onclick={() => pickFile("application/json,.json", false, files => void run(async () => {
      const data: unknown = JSON.parse(await files[0].text());
      if (!isBackup(data)) throw new Error("Das ist keine Wochenwerk-Sicherung.");
      const added = await importAll(data);
      await load();
      say(added ? `${added} Einträge eingelesen.` : "Alles daraus war schon da.");
    }, ""))}>Sicherung einlesen</button></div><p class="small muted">Einlesen fügt hinzu und überschreibt nie.</p></Panel>
<Panel section="Symbole" state={symbolsState || "Von ARASAAC"} class="panel__body" bind:open={unfolded.symbole}>{#if !ready}<p class="small">{connected ? "Für METACOM legst du deinen lizenzierten Ordner in die Ablage." : "Ohne eigenen Ordner kommen die Symbole von ARASAAC — ohne Einrichtung."}</p>{/if}{#if !ready && connected}<pre class="tree">{[folderName(where) || HOME, `├── METACOM_9_Desktop   ← hier hinein`, "├── termine", "└── personen"].join("\n")}</pre><p class="small muted">Meist heißt er METACOM_9_Desktop. Wer die Ablage teilt, teilt METACOM mit — ob das erlaubt ist, steht in deiner Lizenz.</p>{/if}{#if looked}<p class="notice bad">{looked.length ? `Dort ist kein METACOM-Ordner. Gefunden habe ich: ${looked.join(", ")}.` : "Der Ordner ist noch leer."}</p>{/if}{#if connected && !ready}<div class="acts"><button class="btn sm primary" type="button" onclick={() => void lookForMetacom()}>Nochmal nachsehen</button></div>{/if}<Vanilla node={symbolsPanel.node} />{#if ready}<p class="small">{fromFolder ? `METACOM liegt in „${folderName(where)}“ — jedes Gerät, das die Ablage erreicht, zeichnet damit.` : "Gezeichnet wird mit METACOM aus einem eigenen Ordner."}</p>{/if}{#if found.length >= 2}<div class="opt"><label class="field-row"><span class="lbl">Darstellung</span><Dropdown label={namedRendering(preferredRendering())} build={add => { const live = preferredRendering(); add(namedRendering(null), chooseRendering(null), { checked: live === null }); for (const entry of found) add(namedRendering(entry.segment), chooseRendering(entry.segment), { checked: live === entry.segment }); }} /></label><p class="small muted">METACOM führt dieselben Symbole mehrfach. Die Vorgabe sortiert die Suche; ausgeschlossen wird nichts.</p></div>{/if}</Panel>
<Panel section="Stimme" state={!loaded ? "Wird geladen …" : chosen ? namedVoice || "gewählte Stimme fehlt" : "keine gewählt"} class="panel__body" bind:open={unfolded.stimme}><p class="small muted">Eine Stimme für den ganzen Kalender — nicht je Termin oder Karte.</p>{#if refused}<p class="notice bad">Azure nimmt den Schlüssel nicht an ({refused}). Unten stehen nur die Stimmen, die keinen brauchen.</p>{/if}{#if chosen && !namedVoice}<p class="notice">Die gewählte Stimme gibt es auf diesem Gerät gerade nicht. Bis eine andere gewählt wird, bleibt sie gespeichert.</p>{/if}{#if loaded}{#if voices.length}<Vanilla node={picker.node} />{:else}<p class="empty">keine Stimme verfügbar</p>{/if}{/if}</Panel>
<Panel section="Sprachdienst" state={!azureLoaded ? "Wird geladen …" : azure ? `Schlüssel ••••${azure.key.slice(-4)}` : "Kein Schlüssel"} class="panel__body" bind:open={unfolded.sprachdienst}><p class="small muted" role="status">{probe}</p><p class="small muted">Kostenpflichtig, braucht ein Konto bei Microsoft. Der Schlüssel bleibt in diesem Browser und geht direkt zu Microsoft.</p><p class="small muted">Ein Schlüssel für den ganzen Kalender.</p><div class="row-of"><label class="field-row"><span class="lbl">Schlüssel</span><input class="field" type="password" autocomplete="off" placeholder={azure ? `••••${azure.key.slice(-4)}` : ""} bind:value={key} /></label><label class="field-row"><span class="lbl">Region</span><input class="field" type="text" list="azure-regionen" spellcheck="false" bind:value={region} /></label></div><datalist id="azure-regionen">{#each AZURE_REGIONS as name}<option value={name}></option>{/each}</datalist><p class="small muted">Steht im Azure-Portal bei deiner Speech-Ressource.</p><div class="acts"><button class="btn sm primary" type="button" disabled={checking} onclick={() => void keep()}>{checking ? "Wird geprüft …" : "Speichern"}</button>{#if azure}<button class="btn sm destructive" type="button" onclick={() => void forgetKey()}>Schlüssel entfernen</button>{/if}</div></Panel>
<Panel section="Karten" state={`${cardList.length} ${cardList.length === 1 ? "Karte" : "Karten"}`} class="panel__body" bind:open={unfolded.karten}>{#if editingCard}<CardEditor card={editingCard} done={async () => { editingCard = null; await load(); moved(); }} />{:else}<p class="small muted">Karten sind das, was zur Wahl steht: ein Bild mit NFC-Tag, das du hinlegst.</p><div class="rows">{#each cardList as card}<Row title={card.name}>{#snippet lead()}<Picture symbol={card.symbol} name={card.name} />{/snippet}{#snippet state()}{#if card.nfc}<code class="nfc">{card.nfc}</code>{:else}<span class="row__state small muted">keine Nummer</span>{/if}{/snippet}{#snippet actions()}<Overflow build={add => { add("Bearbeiten", () => { editingCard = card; }); add("Entfernen", () => void eraseCard(card), { danger: true }); }} />{/snippet}</Row>{/each}</div>{#if !cardList.length}<p class="empty">noch keine</p>{/if}<button class="btn sm" type="button" onclick={() => { editingCard = { id: uuid(), name: "", updatedAt: 0 }; }}>＋ Neue Karte</button>{/if}</Panel>
<Panel section="Personen" state={`${people.length} ${people.length === 1 ? "Person" : "Personen"}`} class="panel__body" bind:open={unfolded.personen}>{#if editingPerson}<PersonEditor person={editingPerson} done={async () => { editingPerson = null; await load(); moved(); }} />{:else}<div class="rows">{#each people as person}<Row title={person.name} state={person.birthday ? `Geburtstag ${dayLabel(person.birthday)}` : "kein Geburtstag"}>{#snippet lead()}<Face {person} />{/snippet}{#snippet actions()}<Overflow build={add => { add("Bearbeiten", () => { editingPerson = person; }); add("Entfernen", () => void erasePerson(person), { danger: true }); }} />{/snippet}</Row>{/each}</div>{#if !people.length}<p class="empty">noch niemand</p>{/if}<button class="btn sm" type="button" onclick={() => { editingPerson = { id: uuid(), name: "", initials: "", tone: "", updatedAt: 0 }; }}>＋ Neue Person</button>{/if}</Panel>
<Panel section="Aussehen" state={THEME_WORDS[theme]} class="panel__body" bind:open={unfolded.aussehen}><div class="segmented" role="group" aria-label="Aussehen">{#each THEMES as option}<button type="button" aria-pressed={option === theme} onclick={() => { saveTheme(THEME_KEY, option); applyTheme(option); theme = option; }}>{THEME_WORDS[option]}</button>{/each}</div><p class="small muted">Gilt für den Kalender in diesem Browser. Das Board bleibt dunkel.</p></Panel>
<Panel section="Löschen" state="" class="panel__body" bind:open={unfolded.loeschen}><p class="small muted">Den Kalender leeren und von vorn planen. Karten und Personen bleiben.</p><div class="acts"><button class="btn sm" type="button" onclick={() => void wipe(false)}>Alle Termine löschen</button></div><hr class="hair" /><p class="small muted">Alles, was Wochenwerk kennt. Danach ist es wie frisch installiert.</p><div class="acts"><button class="btn sm destructive" type="button" onclick={() => void wipe(true)}>Alle Daten löschen</button></div></Panel>
