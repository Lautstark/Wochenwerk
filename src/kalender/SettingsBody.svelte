<script lang="ts">
  /* One panel open at a time, and the state in the heading so the column reads as a
     list of answers rather than a scroll through everything anybody has opened.
     `name=` is the platform's own accordion. conventions.md §3.5, and the markup
     is @lautstark/design/svelte/Panel's — §6.2. */
  import { untrack } from "svelte";
  import { readTheme, type Theme } from "@lautstark/design/theme";
  import { listVoices } from "@lautstark/stimmquelle";
  import { downloadJson } from "@lautstark/werkzeuge/download";
  import type { AblageStatus } from "@lautstark/sicherung/ablage";
  import { standing } from "../announce.js";
  import { hearSample, prepare } from "../speech.js";
  import { dayLabel, type Card, type Person } from "../model.js";
  import { adoptFolder, carriedOver, clearAll, countAll, exportAll, importAll, isBackup, removeCard, removePerson, saveAzure, saveSettings, saveVoice, settings, uuid, wipeReaches } from "../db.js";
  import { arasaac } from "@lautstark/bildquelle";
  import type { SymbolSource } from "@lautstark/bildquelle/symbole-panel";
  import { chooseSource, chosenSource, metacom, preferredRendering, preferRendering, useFolder } from "../symbols.js";
  import { caveats, labelOf, nameOf, offered, type Voice } from "../voices.js";
  import { load, shown } from "../store.svelte.js";
  import { ablage as ablageStore, isStore, metacomInFolder, stopTelling, tellOthers } from "../folder.js";
  import { backup, keepsFolders } from "../backup.js";
  import { confirmDialog, openDialog } from "../views/dialog.js";
  import type { SettingsState } from "./settings.svelte.js";
  import Panel from "@lautstark/design/svelte/Panel";
  import ThemePicker from "@lautstark/design/svelte/ThemePicker";
  /* The provider panels, declared. Until 2026-09-17 each of these was a
     plain DOM node from the package's vanilla twin, hosted through
     `@lautstark/design/svelte/Vanilla` — a wrapper, an `$effect` to sign the
     panel up for what it had to be told about, and an `onDestroy` to dispose
     it, three times over. The components subscribe and unsubscribe themselves,
     so all of that is gone with the host; conventions.md §6.5 to §6.9.

     No cast on any of the five, and that is the whole of what round 3a was
     withdrawn for: the components used to be typed against their own package's
     `src/`, `tsc` brands a class's declaration `#private;`, and so the
     `Ablage`, `Sicherung` and `MetacomProvider` this product holds — all built
     from the published entries — were nominally distinct from the ones the
     props asked for. They import `../dist` now, and the objects go straight
     in. */
  import DatenPanel from "@lautstark/sicherung/svelte/DatenPanel";
  import SymbolePanel from "@lautstark/bildquelle/svelte/SymbolePanel";
  import VoicePicker from "@lautstark/stimmquelle/svelte/VoicePicker";
  import AzureConnection, { type AzureConnectionWords } from "@lautstark/stimmquelle/svelte/AzureConnection";
  import type { AzureAccess, AzureAnswer } from "@lautstark/stimmquelle/svelte/AzurePanel";
  import Overflow from "@lautstark/design/svelte/Overflow";
  import Row from "../pieces/Row.svelte";
  import Picture from "../pieces/Picture.svelte";
  import Face from "../pieces/Face.svelte";
  import CardEditor from "./CardEditor.svelte";
  import PersonEditor from "./PersonEditor.svelte";

  let { s }: { s: SettingsState; handle: unknown } = $props();
  /* Once: the sheet is opened with one `say` and is never handed another. */
  const say = untrack(() => s.say);

  /**
   * Which panel stands open, one field per panel.
   *
   * „Aussehen" first and open on arrival, the way „Sprache & Aussehen" stands
   * in the other Lautstark programmes since 2026-10-31. This one has no
   * language to choose — no i18n module, both pages hardcoded `lang="de"` — so
   * the panel is the half that is left, in the place the whole one has
   * everywhere else. Everything else folded.
   *
   * Bound rather than passed one way, and that is a correctness matter rather
   * than a style. `name="settings"` is the platform's own accordion: opening
   * one panel makes the browser remove another's `open` attribute *itself*, and
   * Svelte never sees it happen. A one-way prop would leave this record saying
   * „open" about a panel the browser has folded, and the next write of `true`
   * would short-circuit against that record without reaching the DOM.
   */
  const unfolded = $state({
    aussehen: true, daten: false, symbole: false, stimme: false,
    karten: false, personen: false,
  });

  /* localStorage, like the three siblings: the scheme has to be readable before
     the first paint, and a database read is a frame too late. kalender/index.html
     reads this same key inline, and src/kalender.ts hands the same key to
     `initTheme` — which is the half no picker inside a sheet can do. */
  const THEME_KEY = "wochenwerk.theme";
  const THEME_WORDS: Record<Theme, string> = { system: "Wie das Gerät", light: "Hell", dark: "Dunkel" };

  /**
   * Whether Azure answers for this key and this region. „Gespeichert" describes
   * the database; the person who typed a key wants to know whether Microsoft
   * answers, and each way it does not points somewhere different.
   *
   * Injected into `AzureConnection` rather than owned by it — §6.9. The panel decides
   * *when* to ask (on arrival, and again before a save is written) and puts the
   * answer into words; which regex means „refused" stays here, beside the
   * `listVoices` call that produces the error, and this is the product's only
   * one.
   *
   * Typed against the panel's own `AzureAccess` and `AzureAnswer`, which is why
   * the key is optional: a product whose key lives on a machine it cannot read
   * back sends none. This one always can, so an absent key is nothing to ask
   * Microsoft about and is answered here rather than turned into a catalogue
   * call without one — `listVoices` with no key answers happily about the
   * shipped voices, which would be a „works" for a key that was never sent.
   */
  async function probeAzure({ key, region }: AzureAccess): Promise<AzureAnswer> {
    if (!key) return { ok: false, code: "refused", words: "kein Schlüssel" };
    try {
      return { ok: true, count: (await listVoices({ lang: "de", azure: { key, region } })).length };
    } catch (error) {
      const words = error instanceof Error ? error.message : String(error);
      const code = error instanceof TypeError ? "unreachable"
        : /rejected the key|401|403/.test(words) ? "refused" : "failed";
      return { ok: false, code, words };
    }
  }

  /**
   * Every sentence the Azure box under the voices says, and all of them this
   * product's — §6.0: a shared component carries no German.
   *
   * The box's own words (what it is, whether it is connected, its one button)
   * are bildhaft's, so the connection reads the same in every programme. The
   * form's are the ones the hand-drawn panel said, moved rather than rewritten
   * — `refusedOnSave` is the longer one, because a save is the moment the key
   * and the region are being paired and the wrong pairing answers exactly the
   * same 401 as a wrong key.
   */
  const AZURE_WORDS: AzureConnectionWords = {
    key: "Schlüssel",
    region: "Region",
    regionHint: "Steht im Azure-Portal neben dem Schlüssel.",
    save: "Speichern",
    cancel: "Abbrechen",
    saving: "Wird geprüft …",
    forget: "Schlüssel entfernen",
    asking: "Frage Azure …",
    typeFirst: "Erst einen Schlüssel eintippen.",
    answers: many => `${many} ${many === 1 ? "Stimme" : "Stimmen"} verfügbar`,
    saved: many => `Azure Speech freigeschaltet — ${many} Stimmen stehen zur Wahl.`,
    unreachable: "Die Region antwortet nicht — stimmt der Regionsname?",
    refused: "Azure nimmt den Schlüssel nicht an.",
    refusedOnSave: "Azure hat den Schlüssel abgelehnt. Meistens ist es die Region: sie muss die der Speech-Ressource sein, nicht die deines Kontos.",
    failed: words => `Azure hat nicht geantwortet (${words}).`,
    title: "Stimmen von Microsoft Azure",
    off: "nicht verbunden",
    on: "verbunden",
    refusedState: "abgelehnt",
    offNote: "Mehr Stimmen, die natürlicher klingen. Dafür brauchst du ein eigenes Azure-Konto.",
    onNote: (hint, region) => `Schlüssel ••••${hint} · Region ${region}`,
    refusedNote: "Azure nimmt den Schlüssel nicht mehr an. Bis das behoben ist, sprechen die Stimmen auf diesem Gerät.",
    connect: "Verbinden …",
    change: "Ändern …",
    check: "Schlüssel und Region prüfen …",
  };

  /* Where the household's Speech resource is when nothing is stored yet —
     Frankfurt, as in bildhaft. stimmquelle's own default is still westeurope. */
  const AZURE_REGION = "germanywestcentral";

  /* Where a region is, in the words of somebody who has never opened the Azure
     portal. Only the ones in Europe; anything else reads as Azure's code.
     bildhaft's table. */
  const REGION_NAMES: Record<string, string> = {
    germanywestcentral: "Frankfurt",
    westeurope: "Niederlande",
    northeurope: "Irland",
    switzerlandnorth: "Zürich",
    francecentral: "Paris",
    uksouth: "London",
    swedencentral: "Schweden",
    norwayeast: "Oslo",
  };

  const ablageStatus = (): AblageStatus => ablageStore.status;
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
  let told = $state(false);
  /* What the shared panels tell their headings: where the work is, and which
     symbols are in force. */
  let dataState = $state("");
  let symbolsState = $state("");
  /* The name of the Ablage folder METACOM was found in, until the next act on
     the symbols — it is the answer to a question just asked. */
  let fromFolder = $state<string | null>(null);
  /* A card and a person are edited inside the panel that lists them, not in a sheet
     over this one. */
  let editingCard = $state<Card | null>(null);
  let editingPerson = $state<Person | null>(null);
  /* What is stored, so the Azure box can say whether it is connected. The key
     is held here because the box shows the four characters it ends in — never
     the value, which is the whole of that design. */
  let azure = $state<{ key: string; region: string } | undefined>(undefined);
  let theme = $state<Theme>(readTheme(THEME_KEY));

  const run = async (work: () => Promise<unknown>, done: string) => {
    try { await work(); if (done) say(done); }
    catch (error) { say(`Das ging nicht: ${(error as Error)?.message ?? "unbekannter Fehler"}`); }
    await load();
    moved();
  };

  /* What the Ablage panel offers besides the folder, and the only part of it
     this product owns: whether the household lets the other Lautstark
     programmes on this device see where the folder is. `reads` is a thunk the
     panel calls while it draws, so it is `told` that repaints the switch —
     which is why there is no `$effect` signing the panel up for anything any
     more. */
  const share = {
    reads: () => told,
    write: async (on: boolean) => {
      told = on;
      await saveSettings({ tellOthers: on });
      if (on) tellOthers(folderName(ablageStatus()));
      else stopTelling();
    },
  };

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
    /* stimmquelle throws on a key it cannot use, so the list is asked for a
       second time without the key. The Azure box under the list says why. */
    try {
      voices = await offered();
    } catch {
      voices = await offered(false).catch(() => []);
    }
    loaded = true;
  }

  /* What is stored, for the heading and for the placeholder. Nothing else is
     read here any more: the panel empties its own field on every draw, seeds
     its own region field from `region`, and asks Azure itself. */
  async function readAzure() {
    azure = (await settings()).azure;
  }

  /**
   * Write the key the panel has already had Azure agree to.
   *
   * `key` is absent where the field was untouched *and* the panel had nothing
   * stored to fall back on — which cannot happen in this product, because
   * `stored` below reads the database. It is resolved rather than asserted: a
   * `saveAzure(undefined)` here would switch Azure off in the middle of a save,
   * and removing the key is the other button's job.
   */
  async function keepAzure({ key, region }: AzureAccess) {
    const secret = key || (await settings()).azure?.key;
    if (!secret) return say("Erst einen Schlüssel eintippen.");
    await saveAzure({ key: secret, region });
    await readAzure();
    /* And the list of voices, which is the whole reason somebody typed a key. */
    await readVoices();
  }
  async function forgetAzure() {
    await saveAzure(undefined);
    say("Die Stimmen von Microsoft Azure sind wieder aus.");
    await readAzure();
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
  const wipe = async () => {
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
    const list = [count(counted.termine, "Termin", "Termine"), count(counted.karten, "Karte", "Karten"),
      count(counted.personen, "Person", "Personen")].join(", ");
    const far = reach === "folder"
      ? ` Auch im Ordner „${named}“, und damit auf jedem Gerät, das ihn benutzt.`
      : "";
    if (await confirmDialog({
      title: "Alle Daten löschen",
      body: `${list} werden gelöscht.${far} Das lässt sich nicht rückgängig machen.`,
      confirmLabel: "Alles löschen", danger: true,
      /* The only act in this product that asks for a word. */
      requireTyping: "löschen", typingLabel: "Tipp „löschen“, um zu bestätigen",
    })) {
      await run(clearAll, "Gelöscht.");
    }
  };

  /**
   * Symbole: ARASAAC or METACOM, as one question — @lautstark/bildquelle's
   * SymbolePanel, the same panel as in bildhaft. It replaced MetacomPanel, the
   * Ablage tree drawn above it, „Nochmal nachsehen" and the „Darstellung"
   * dropdown below it on 2026-10-31. The fassung is in the METACOM card's ⋯ now.
   *
   * `chosenSource()` is what the household answered; the panel draws METACOM
   * as the answer only while its folder can be read. `pick` writes it down and
   * hands it to symbols.ts, and then does what a change of source always did
   * here: the folder-found note goes, the store is reloaded, the panels are
   * told.
   */
  let source = $state<SymbolSource>(chosenSource());
  /* What moving the answer did, waiting one task for a `say` from the panel to
     take its place — after a folder is read in, the panel calls `pick` and then
     says „METACOM ist eingerichtet", and one sentence is enough. */
  let pickedTimer: ReturnType<typeof setTimeout> | undefined;
  async function pickSource(next: SymbolSource) {
    const was = source;
    source = next;
    chooseSource(next);
    fromFolder = null;
    await run(() => saveSettings({ symbolSource: next }), "");
    if (next === was || (next === "arasaac" && !metacom.isReady())) return;
    clearTimeout(pickedTimer);
    pickedTimer = setTimeout(() => say(`Neue Symbole kommen jetzt von ${next === "metacom" ? "METACOM" : "ARASAAC"}. Was schon im Kalender ist, behält sein Bild.`));
  }
  const symbolsSaid = (line: string) => { clearTimeout(pickedTimer); say(line); };

  /**
   * METACOM in the Ablage, looked for without being asked.
   *
   * A household that keeps its licensed folder beside its calendar should not
   * have to set it up again on every device. Until 2026-10-31 that was a tree
   * of the Ablage, a sentence and a „Nochmal nachsehen" button; now the panel
   * looks each time it is unfolded and METACOM is not ready, and only says
   * something when it found it. The capability is the one the Ablage already
   * holds, so nothing is asked.
   */
  /* Once at a time: indexing a whole METACOM folder takes minutes on the
     Wyse, and folding and unfolding in the meantime must not start a second. */
  let looking = false;
  async function lookInAblage() {
    if (looking || !isStore() || metacom.isReady()) return;
    looking = true;
    const found = await metacomInFolder().catch(() => null);
    if (found) await useFolder(found.handle).catch(() => undefined);
    looking = false;
    if (!found || !metacom.isReady()) return;
    await pickSource("metacom");
    clearTimeout(pickedTimer);
    fromFolder = found.name;
    say(`METACOM aus „${found.name}“ gelesen. Neue Symbole kommen jetzt von METACOM.`);
  }
  $effect(() => { if (unfolded.symbole) void untrack(lookInAblage); });

  /* Which fassung of a doubled symbol the search should offer first — in the
     METACOM card's ⋯, offered by the panel only where the folder holds two or
     more. Told to the provider and written down, in that order. */
  const rendering = $derived.by(() => {
    void stamp;
    return {
      current: preferredRendering(),
      choose: (segment: string | null) => void run(async () => {
        preferRendering(segment);
        await saveSettings({ metacomRendering: segment ?? undefined });
      }, segment ? `Darstellung „${segment}“ wird bevorzugt.` : "Keine Darstellung mehr bevorzugt."),
    };
  });

  /* The provider mutates in place; its own `subscribe` is what moves `ready`
     when the panel reads, re-reads or forgets a folder. */
  $effect(() => metacom.subscribe(moved));
  let ready = $derived.by(() => { void stamp; return metacom.isReady(); });
  let connected = $derived.by(() => { void stamp; return isStore(); });
  let cardList = $derived([...shown().cards.values()]);
  let people = $derived(shown().people);
  let namedVoice = $derived(nameOf(voices, chosen));

  /* The panel answers in three fixed words and none of them is about what this
     browser was holding when the folder was chosen. Connecting a folder that is
     already a store used to delete that silently; it is carried over now, and a
     household is owed the number. */
  function afterAdopting(): void {
    moved();
    const many = carriedOver();
    if (many) say(`${many} ${many === 1 ? "Eintrag" : "Einträge"} aus diesem Browser in den Ordner übernommen.`);
  }

  void readAzure();
  void readVoices();
  void readTelling();
</script>

<!--
  „Aussehen" first and open on arrival — the place „Sprache & Aussehen" has in
  every Lautstark programme; this one has no language to choose.
--><Panel section="Aussehen" state={THEME_WORDS[theme]} class="panel__body" bind:open={unfolded.aussehen}><ThemePicker key={THEME_KEY} label={one => THEME_WORDS[one]} ariaLabel="Aussehen" bind:theme /><p class="small faint">Gilt nur in diesem Browser. Das Board bleibt dunkel.</p></Panel>
<!--
  „Deine Daten", @lautstark/sicherung's DatenPanel: the same panel in every
  Lautstark programme, in place of „Ablage" and „Sicherung" until 2026-10-31.
  One box says where the calendar is and whether that is safe, at most one
  button sits under it, and the ⋯ in its corner holds another folder, forgetting
  it, the dated second copy (only without a folder), the backup file out and
  in, and — red, last — deleting everything, which still asks for the word.
--><Panel section="Deine Daten" state={dataState} class="panel__body" bind:open={unfolded.daten}><DatenPanel
  store={ablageStore} adopt={adoptFolder} changed={() => void load().then(afterAdopting)} {say} {share}
  backup={keepsFolders ? backup : null}
  headline={text => { dataState = text; }}
  file={{
    note: "Termine, Karten und Personen als eine Datei.",
    download: () => void run(async () => {
      const made = await exportAll();
      const day = new Date().toISOString().slice(0, 10);
      downloadJson(made, `wochenwerk-sicherung-${day}.json`);
    }, "Sicherung geschrieben."),
    read: picked => void run(async () => {
      const data: unknown = JSON.parse(await picked.text());
      if (!isBackup(data)) throw new Error("Das ist keine Wochenwerk-Sicherung.");
      const added = await importAll(data);
      await load();
      say(added ? `${added} Einträge eingelesen.` : "Alles daraus war schon da.");
    }, ""),
  }}
  wipe={() => void wipe()} /></Panel>
<Panel section="Symbole" state={symbolsState} class="panel__body" bind:open={unfolded.symbole}><SymbolePanel
  {metacom} current={source} pick={pickSource} say={symbolsSaid}
  attribution={arasaac.attribution ?? null} {rendering}
  headline={text => { symbolsState = text; }} />{#if ready && fromFolder}<p class="small faint">METACOM liegt in „{fromFolder}“. Jedes Gerät, das die Ablage benutzt, findet es dort.</p>{:else if connected && !ready}<p class="small faint">Liegt dein METACOM-Ordner in der Ablage, findet der Kalender ihn hier von selbst — auf jedem Gerät, das sie benutzt. Ob du METACOM so teilen darfst, steht in deiner Lizenz.</p>{/if}</Panel>
<Panel section="Stimme" state={!loaded ? "Wird geladen …" : chosen ? namedVoice || "gewählte Stimme fehlt" : "keine gewählt"} class="panel__body" bind:open={unfolded.stimme}>{#if chosen && loaded && !namedVoice}<p class="notice">Die gewählte Stimme gibt es auf diesem Gerät gerade nicht. Bis eine andere gewählt wird, bleibt sie gespeichert.</p>{/if}{#if loaded}{#if voices.length}<VoicePicker
  folded voices={() => voices} current={() => chosen}
  pick={id => { if (id && id !== chosen) void choose(id); }}
  hear={async (voice, onProgress) => {
    try { await hearSample(voice.id, onProgress); }
    catch (error) { say(`${labelOf(voice, voices)} konnte nicht sprechen: ${(error as Error)?.message ?? "unbekannter Fehler"}`); }
  }}
  notes={voice => caveats(voice as Voice)} />{:else}<p class="empty">keine Stimme verfügbar</p>{/if}{/if}<AzureConnection
  id="azure" formId="azure-form" fieldId="azure-key" regionId="azure-region"
  saveId="azure-save" forgetId="azure-forget" probeId="azure-probe"
  hasKey={!!azure} hint={azure?.key.slice(-4) ?? ""} region={azure?.region ?? AZURE_REGION}
  regionName={code => REGION_NAMES[code] ?? code}
  stored={async () => (await settings()).azure?.key}
  probe={probeAzure} save={keepAzure} forget={forgetAzure}
  words={AZURE_WORDS} announce={say}
  ><p>Kostet etwas und braucht ein Konto bei Microsoft. Die Wörter gehen von diesem Browser direkt an Microsoft; der Schlüssel bleibt hier und gilt für den ganzen Kalender.</p></AzureConnection><p class="small faint">Eine Stimme für den ganzen Kalender — nicht je Termin oder Karte.</p></Panel>
<Panel section="Karten" state={`${cardList.length} ${cardList.length === 1 ? "Karte" : "Karten"}`} class="panel__body" bind:open={unfolded.karten}>{#if editingCard}<CardEditor card={editingCard} done={async () => { editingCard = null; await load(); moved(); }} />{:else}<p class="small muted">Karten sind das, was zur Wahl steht: ein Bild mit NFC-Tag, das du hinlegst.</p><div class="rows">{#each cardList as card}<Row title={card.name}>{#snippet lead()}<Picture symbol={card.symbol} name={card.name} />{/snippet}{#snippet state()}{#if card.nfc}<code class="nfc">{card.nfc}</code>{:else}<span class="row__state small muted">keine Nummer</span>{/if}{/snippet}{#snippet actions()}<Overflow label="Mehr" anchor={false} class="btn icon quiet" build={add => { add("Bearbeiten", () => { editingCard = card; }); add("Entfernen", () => void eraseCard(card), { danger: true }); }} />{/snippet}</Row>{/each}</div>{#if !cardList.length}<p class="empty">noch keine</p>{/if}<button class="btn sm" type="button" onclick={() => { editingCard = { id: uuid(), name: "", updatedAt: 0 }; }}>＋ Neue Karte</button>{/if}</Panel>
<Panel section="Personen" state={`${people.length} ${people.length === 1 ? "Person" : "Personen"}`} class="panel__body" bind:open={unfolded.personen}>{#if editingPerson}<PersonEditor person={editingPerson} done={async () => { editingPerson = null; await load(); moved(); }} />{:else}<div class="rows">{#each people as person}<Row title={person.name} state={person.birthday ? `Geburtstag ${dayLabel(person.birthday)}` : "kein Geburtstag"}>{#snippet lead()}<Face {person} />{/snippet}{#snippet actions()}<Overflow label="Mehr" anchor={false} class="btn icon quiet" build={add => { add("Bearbeiten", () => { editingPerson = person; }); add("Entfernen", () => void erasePerson(person), { danger: true }); }} />{/snippet}</Row>{/each}</div>{#if !people.length}<p class="empty">noch niemand</p>{/if}<button class="btn sm" type="button" onclick={() => { editingPerson = { id: uuid(), name: "", initials: "", tone: "", updatedAt: 0 }; }}>＋ Neue Person</button>{/if}</Panel>
