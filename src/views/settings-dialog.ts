import { openDialog, confirmDialog } from "@lautstark/design/dialog";
import { listVoices } from "@lautstark/stimmquelle";
import { standing } from "../announce.js";
import { prepare } from "../speech.js";
import { button, el, field, fill, input, pickFile, spacer } from "../ui.js";
import { dayLabel, type Card, type Person } from "../model.js";
import { clearAll, clearAppointments, removeCard, removePerson, saveAzure, saveSettings, saveVoice, settings, uuid } from "../db.js";
import { connect, forget, metacom, needsAttention, preferredRendering, preferRendering, rebuild, reconnect,
  renderings, says, sourceInUse, supportsPicker, useFolder, useFolderFiles, useZip } from "../symbols.js";
import { labelOf, nameOf, offered, type Voice } from "../voices.js";
import { hearSample } from "../speech.js";
import { load, shown } from "../store.js";
import { ablage as ablageStore, adopted, folders, HOME, isStore, metacomInFolder, nest } from "../folder.js";
import { adoptFolder, pullFromFolder } from "../db.js";
import { actionsFor as ablageActions, lineFor as ablageLine, needsAttention as ablageNeedsAttention } from "@lautstark/sicherung/ablage-ui";
import type { AblageStatus } from "@lautstark/sicherung/ablage";
import { cardThumb, dropdown, face, overflow, row } from "./pieces.js";
import { cardEditor } from "./card-editor.js";
import { personEditor } from "./person-editor.js";
import { voiceChoice } from "./voice-panel.js";

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

type Azure = { key: string; region: string };
type Answer = { ok: true; count: number } | { ok: false; code: "unreachable" | "refused" | "failed"; words: string };

/**
 * Whether Azure answers for this key and this region. „Gespeichert" describes
 * the database; the person who typed a key wants to know whether Microsoft
 * answers, and each way it does not points somewhere different: a region name
 * that is not one is a hostname that never resolves, so the fetch dies as a
 * TypeError before any status exists, while a live region with a wrong key
 * answers 401.
 *
 * `listVoices` throws on a key that does not work rather than quietly handing
 * back the shipped voices alone — which is what makes it a probe and not just a
 * list. The count it returns is every voice this calendar can then speak in.
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

interface Panel { node: HTMLDetailsElement; state: HTMLElement; body: HTMLElement }

/* One panel open at a time, and the state in the heading so the column reads as a
   list of answers rather than a scroll through everything anybody has opened.
   `name=` is the platform's own accordion. conventions.md §3.5. */
function makePanel(label: string): Panel {
  const state = el("span", { class: "state" });
  const body = el("div", { class: "panel__body" });
  const node = el("details", { class: "panel", attrs: { name: "settings" } },
    el("summary", {}, el("span", { class: "section", text: label }), state), body);
  return { node, state, body };
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
/* Every Lautstark product files under the folder somebody picks, so one folder
   can hold them all — and picking a Dropbox root instead scatters them through
   it. This is how the panel tells a folder that already gathers them from one
   that is about to be scattered into. */
const OURS = ["wochenwerk", "bildhaft", "mitreden", "vorlaut"];
const gathersUs = (names: string[]) => names.some(name => OURS.includes(name.toLowerCase()));
/* A picture of the folder, the way a file manager draws it. Somebody who cannot
   follow a sentence about nesting recognises a shape they have seen a thousand
   times. */
const tree = (lines: string[]) => el("pre", { class: "tree", text: lines.join("\n") });

const actionSays = (id: string, connected: boolean) =>
  id === "choose" ? (connected ? "Anderer Ordner" : "Ordner wählen")
    : id === "confirm" ? "Erneut erlauben" : id === "retry" ? "Nochmal versuchen" : "Ordner vergessen";
const folderName = (status: AblageStatus) => "folder" in status ? status.folder : "";

export function openSettings(say: (line: string) => void) {
  const ablage = makePanel("Ablage");
  const symbols = makePanel("Symbole");
  const voice = makePanel("Stimme");
  const speech = makePanel("Azure Speech");
  const cards = makePanel("Karten");
  const people = makePanel("Personen");
  const data = makePanel("Daten");

  const handle = openDialog({
    title: "Einstellungen", closeLabel: "Schließen", wide: true,
    body: [ablage.node, symbols.node, voice.node, speech.node, cards.node, people.node, data.node],
    footer: [spacer(), button("Fertig", "primary", () => handle.close())],
  });

  const run = async (work: () => Promise<unknown>, done: string) => {
    try { await work(); say(done); }
    catch (error) { say(`Das ging nicht: ${(error as Error)?.message ?? "unbekannter Fehler"}`); }
    await load();
    sync();
  };

  /* What can be spoken with is asked on every opening rather than held in a
     module: a key typed in the meantime, or a voice the operating system has just
     installed, should show up without reloading the page. */
  let voices: Voice[] = [];
  let chosen: string | undefined;
  /* The catalogue is a database read and, with a key, a request to Azure, so the
     panel cannot be answered on the frame the dialog opens. Until it is, the
     heading says it is loading rather than saying „keine gewählt" and the body
     stays empty — an empty list is an answer, and it was giving the wrong one for
     as long as the catalogue took to arrive. The Azure panel below does the same
     with its own heading. */
  let loaded = false;
  /* Said rather than swallowed. stimmquelle throws on a key it cannot use instead
     of returning the shipped voices alone, because a picker silently short of half
     its voices is a failure only the person who typed the key can fix. So the list
     is asked for a second time without the key: what needs none is still
     choosable, and the line above it says what is missing and why. */
  let refused = "";

  const picker = voiceChoice({
    voices: () => voices,
    current: () => chosen,
    pick: id => { if (id && id !== chosen) void choose(id); },
    /* Trouble is reported here rather than thrown back into the row: the picker
       draws a button, and what to say when a voice will not speak is this
       dialog's business. A refused Azure key and a model that would not download
       both arrive this way, and both are worth hearing about by name — pressing
       ▶ on one voice says nothing about the twenty beside it. */
    hear: async (voice, onProgress) => {
      try { await hearSample(voice.id, onProgress); }
      catch (error) { say(`${labelOf(voice, voices)} konnte nicht sprechen: ${(error as Error)?.message ?? "unbekannter Fehler"}`); }
    },
  });

  /* Choosing writes. There is no pending state and no Save: the panel's heading
     is what stands in the settings record, the way every other panel's is. */
  async function choose(id: string) {
    chosen = id;
    picker.draw();
    await run(() => saveVoice(id), `Der Kalender spricht jetzt mit ${nameOf(voices, id) || "dieser Stimme"}.`);
    /* The sentences that belong to no appointment — the day in its twenty-eight
       forms, and the ones about nothing happening — have no other moment to be
       prepared in. Choosing a voice is the one a household waits through on
       purpose, and every one of them changes with it. */
    void prepare(standing());
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
    sync();
  }


  /* The probe line, and it is the same element for the life of the dialog: a live
     region that is removed and put back announces nothing, because what a reader
     is told about is a change inside something already on screen. Empty when there
     is no key — never hidden, and a <p> with no text takes no room. §3.8.

     It reports inside a modal, so it is a second region and a legitimate one: the
     page's own status line is inert behind `showModal()`. */
  const probe = el("p", { class: "small muted", attrs: { role: "status" } });
  const wording = (answer: Answer) => answer.ok
    ? `${answer.count} ${answer.count === 1 ? "Stimme" : "Stimmen"} verfügbar`
    : answer.code === "unreachable" ? "Die Region antwortet nicht — stimmt der Regionsname?"
      : answer.code === "refused" ? "Azure nimmt den Schlüssel nicht an."
        : "Die Abfrage ist fehlgeschlagen — später noch einmal versuchen.";

  /* Drawn on opening and after a save or a forget, and deliberately not from
     sync(): this panel holds a field somebody is typing into, and a card edited in
     another panel must not carry a half-typed key away with it.

     `known` is the answer a save has just had. Azure would say the same thing
     twice, and the second ask would be a round trip nobody is waiting for. */
  async function drawSpeech(known?: Answer) {
    const azure = (await settings()).azure;
    /* Which key, not merely that there is one: the last four characters tell two
       keys apart without showing either. It sits in the heading, so the answer is
       there before the panel is opened. §3.5. */
    speech.state.textContent = azure ? `Schlüssel ••••${azure.key.slice(-4)}` : "Kein Schlüssel";

    const key = input("password", { attrs: { autocomplete: "off", placeholder: azure ? `••••${azure.key.slice(-4)}` : "" } });
    const region = input("text", { attrs: { list: "azure-regionen", spellcheck: "false" } });
    region.value = azure?.region ?? "westeurope";
    const save = button("Speichern", "sm primary", () => void keep(key.value, region.value, save));

    fill(speech.body,
      probe,
      el("p", { class: "small muted", text: "Azure ist kostenpflichtig und braucht ein Konto. Dein Schlüssel bleibt in diesem Browser; die Anfrage geht von hier direkt zu Microsoft, nie über einen Server von uns." }),
      el("p", { class: "small muted", text: "Ein Schlüssel für den ganzen Kalender — nicht pro Termin, nicht pro Karte und nicht pro Serie." }),
      el("div", { class: "row-of" }, field("Schlüssel", key), field("Region", region)),
      el("datalist", { attrs: { id: "azure-regionen" } }, ...AZURE_REGIONS.map(name => el("option", { attrs: { value: name } }))),
      el("p", { class: "small muted", text: "Die Region steht im Azure-Portal bei deiner Speech-Ressource, z. B. westeurope." }),
      el("div", { class: "acts" }, save,
        azure ? button("Schlüssel entfernen", "sm destructive", () => void forgetKey()) : null));

    if (!azure) return void (probe.textContent = "");
    if (known) return void (probe.textContent = wording(known));
    probe.textContent = "Frage Azure …";
    const answer = await probeAzure(azure);
    probe.textContent = wording(answer);
  }

  /* Checked before it is stored, so a typo is a sentence now rather than a silent
     appointment later. The button says what it is doing meanwhile: the check is a
     network round trip, and a button that does nothing visible for two seconds is
     a button you press again. */
  async function keep(typed: string, where: string, press: HTMLButtonElement) {
    /* The field is empty every time the panel draws, so an untouched one must not
       mean „kein Schlüssel": a save that only moves the region keeps the key it
       already has. Removing it is its own button, not a way to save. */
    const key = typed.trim() || (await settings()).azure?.key;
    if (!key) return say("Erst einen Schlüssel eintippen.");
    const region = where.trim() || "westeurope";
    const was = press.textContent;
    press.disabled = true;
    press.textContent = "Wird geprüft …";
    try {
      const answer = await probeAzure({ key, region });
      if (!answer.ok) {
        /* A key belongs to one region, and the wrong pairing answers exactly the
           same 401 as a wrong key — saying which is more use than repeating Azure. */
        const why = answer.code === "refused"
          ? "Azure hat den Schlüssel abgelehnt. Meistens ist es die Region: sie muss die der Speech-Ressource sein, nicht die deines Kontos."
          : answer.code === "unreachable" ? "Die Region antwortet nicht — stimmt der Regionsname?"
            : `Azure hat nicht geantwortet (${answer.words}).`;
        /* Into the probe line as well as the page's, because the page's is behind a
           modal and inert: this is the answer to the question the panel asks, and
           it has to be readable beside the field it is about. §3.8. */
        probe.textContent = why;
        return say(`Hat nicht geklappt: ${why}`);
      }
      await saveAzure({ key, region });
      say(`Azure Speech freigeschaltet — ${answer.count} Stimmen stehen zur Wahl.`);
      await drawSpeech(answer);
      /* And the list of voices, which is the whole reason somebody typed a key.
         It is read once when the dialog opens, so without this the Azure voices
         arrived only on the next opening — the panel said they were there and the
         picker below it did not have them. */
      await readVoices();
    } catch (error) {
      say(`Hat nicht geklappt: ${(error as Error)?.message ?? "unbekannter Fehler"}`);
    } finally {
      press.disabled = false;
      press.textContent = was;
    }
  }

  async function forgetKey() {
    await saveAzure(undefined);
    say("Azure Speech wieder abgeschaltet.");
    await drawSpeech();
    /* The same seam in the other direction: without this the picker goes on
       offering voices that nothing can speak with any more. */
    await readVoices();
  }

  /* The name of a folder somebody just picked that holds nothing of ours yet, or
     null. It lives across one render because the question is asked in the panel
     rather than in a dialog over it — a modal on top of a modal is the thing this
     dialog was rebuilt to stop doing. */
  let asking: string | null = null;
  /* The name of the folder METACOM was found in, and what a fruitless look
     turned up — both only until the next render, because both are answers to a
     question somebody just asked. */
  let fromFolder: string | null = null;
  let looked: string[] | null = null;

  /* What happens after a folder is settled on, whichever way. */
  async function settle(made: string) {
    const went = await adoptFolder();
    say(went === "pushed" ? `${made} Was hier lag, liegt jetzt dort.`
      : went === "pulled" ? `${made} Der Ordner hatte schon einen Kalender — der gilt jetzt hier.`
      : "Der Ordner konnte nicht vollständig beschrieben werden. Der Kalender bleibt in diesem Browser.");
    sync();
  }

  function sync() {
    const status = metacom.status();
    /* Where the household keeps its week. Not a backup: connecting a folder makes
       it the store, and this browser holds a copy of it from that moment. Once one
       is connected there is nothing left to explain — the heading names it, and
       what belongs here is what is in it. */
    const where = ablageStatus();
    const connected = isStore();
    ablage.state.textContent = whereSays(where);
    fill(ablage.body,
      /* The picture comes before the decision, not after it: five lines answer
         what three paragraphs do not — one folder, a compartment per product,
         METACOM beside them. */
      connected || asking ? null : el("p", { class: "small", text: "Ein Ordner für alle Lautstark-Programme. Jedes legt darin sein eigenes Fach an, und jedes Gerät, das den Ordner erreicht, sieht dieselbe Woche." }),
      connected || asking ? null : tree(["Lautstark", "├── METACOM_9_Desktop", "├── wochenwerk/", "└── bildhaft/"]),
      connected || asking ? null : el("p", { class: "small muted", text: "Ohne Ordner liegt der Kalender nur in diesem Browser — das reicht für einen Haushalt mit einem Gerät. Noch keiner da? Wähle, wo er liegen soll, dann legen wir ihn dort an." }),
      /* True for everybody, always — which is why it needs nothing remembered
         across products to be said. Each product is its own origin, so a folder
         handle cannot travel between them and the picking cannot be skipped;
         what can be skipped is the wondering which folder to pick. */
      connected || asking ? null : el("p", { class: "small muted", text: "Benutzt du schon ein anderes Lautstark-Programm, zeig hier auf denselben Ordner." }),

      /* Asked once, and only where the answer is genuinely open: a folder that
         already gathers Lautstark work is obviously the right one and nothing is
         asked. */
      asking ? el("p", { class: "small", text: `In „${asking}“ liegt noch nichts von Lautstark.` }) : null,
      asking ? tree([asking, `└── ${HOME}   ← neu`, "    └── wochenwerk/"]) : null,
      asking ? el("div", { class: "acts" },
        button(`Ordner „${HOME}“ anlegen`, "sm primary", () => void run(async () => {
          const made = asking!; asking = null;
          await nest(HOME);
          await settle(`Ordner „${HOME}“ in „${made}“ angelegt.`);
        }, "")),
        button(`„${asking}“ direkt benutzen`, "sm quiet", () => void run(async () => {
          asking = null;
          await settle("Ordner verbunden.");
        }, ""))) : null,

      connected && !asking ? el("p", { class: "small", text: `Der Kalender liegt in „${folderName(where)}“. Jedes Gerät, das den Ordner erreicht, sieht dieselbe Woche.` }) : null,
      ablageNeedsAttention(where) ? el("p", { class: "notice bad", text: whereSays(where) }) : null,
      where.kind === "conflicted"
        ? el("p", { class: "notice bad", text: `${where.ids.length} Datei(en) liegen zweimal im Ordner. Wochenwerk entscheidet das nicht — öffne den betroffenen Termin.` })
        : null,
      asking ? null : el("div", { class: "acts" }, ...ablageActions(ablageStore, where).map(action =>
        button(actionSays(action.id, connected),
          /* The accent marks the one action we would pick. Choosing a folder is
             not one of those — it is an offer, and a filled button would argue
             with the sentence above it saying the browser is enough. */
          action.id === "forget" ? "sm destructive"
            : action.id === "retry" || action.id === "confirm" ? "sm primary"
            : connected ? "sm quiet" : "sm",
          () => void run(async () => {
            await action.run();
            if (action.id !== "choose" || !isStore()) return;
            if (!(await adopted()) && !gathersUs(await folders())) {
              asking = folderName(ablageStatus());
              sync();
              return;
            }
            await settle("Ordner verbunden.");
          }, "")))));

    symbols.state.textContent = fromFolder ? `METACOM aus „${fromFolder}“` : says(status);
    fill(symbols.body,
      /* Where the calendar lives in a folder, METACOM belongs beside it: dropped
         in once, found by every device. The alternative is a file dialog per
         device, which is the step people give up at. */
      metacom.isReady() ? null : el("p", { class: "small", text: connected
        ? "Gezeichnet wird gerade mit ARASAAC. Für METACOM legst du deinen lizenzierten Ordner in die Ablage — dann finden ihn alle Geräte von selbst."
        : "Ohne METACOM-Ordner kommen die Symbole von ARASAAC, das keine Einrichtung braucht. METACOM zeichnet aus deiner eigenen Lizenz, und nichts davon verlässt den Browser." }),
      metacom.isReady() || !connected ? null : tree([folderName(where) || HOME, `├── METACOM_9_Desktop   ← hier hinein`, "├── termine", "└── personen"]),
      metacom.isReady() || !connected ? null : el("p", { class: "small muted", text: "Der Ordner heißt bei den meisten METACOM_9_Desktop und enthält einen Ordner METACOM_Symbole. Kopieren oder verschieben — beides geht. Teilst du die Ablage mit anderen, bekommen sie METACOM mit; ob das erlaubt ist, steht in deiner Lizenz." }),
      /* What the app sees, in the same words the file manager uses. "I put it
         there" and "it sees these three names" together turn a mystery into a
         comparison — and the comparison is what somebody can act on. */
      looked ? el("p", { class: "notice bad", text: looked.length
        ? `Dort ist kein METACOM-Ordner. Gefunden habe ich: ${looked.join(", ")}.`
        : "Der Ordner ist noch leer." }) : null,
      metacom.isReady() ? el("p", { class: "small", text: fromFolder
        ? `METACOM liegt in „${folderName(where)}“ — jedes Gerät, das die Ablage erreicht, zeichnet damit.`
        : "Gezeichnet wird mit METACOM aus einem eigenen Ordner." }) : null,
      needsAttention(status) ? el("p", { class: "notice bad", text: says(status) }) : null,
      el("div", { class: "acts" },
        connected && !metacom.isReady()
          ? button("Nochmal nachsehen", "sm primary", () => void run(async () => {
              const found = await metacomInFolder();
              looked = found ? null : await folders();
              if (found) { await useFolder(found.handle); fromFolder = found.name; looked = null; }
              sync();
            }, "")) : null,
        button(supportsPicker ? (connected ? "Anderen Ordner wählen" : "Ordner wählen") : "Ordner hochladen",
          connected || metacom.isReady() ? "sm quiet" : "sm",
          () => supportsPicker ? void run(() => connect(), "Ordner gelesen.")
            : pickFile("", true, files => void run(() => useFolderFiles(files), "Ordner gelesen."))),
        button("ZIP lesen", "sm quiet", () => pickFile(".zip,application/zip", false, files => void run(() => useZip(files[0]), "ZIP gelesen."))),
        status.kind === "needs-setup" && status.code === "permission-needed"
          ? button("Erneut erlauben", "sm primary", () => void run(() => reconnect(), "Erlaubnis wieder da.")) : null,
        metacom.isReady() ? button("Neu einlesen", "sm quiet", () => void run(() => rebuild(), "Neu eingelesen.")) : null,
        metacom.isReady() ? button("Ordner vergessen", "sm destructive", () => void run(async () => { fromFolder = null; await forget(); }, "Ordner vergessen.")) : null),
      renderingChooser());

    /* One voice for the whole calendar, so the heading names it the way the other
       headings carry their state. */
    const named = nameOf(voices, chosen);
    voice.state.textContent = !loaded ? "Wird geladen …"
      : chosen ? named || "gewählte Stimme fehlt" : "keine gewählt";
    fill(voice.body,
      el("p", { class: "small muted", text: "Eine Stimme für den ganzen Kalender. Ein Termin wird beim Planen aufgenommen und am Board vorgelesen — nicht je Termin, je Karte oder je Person gewählt, sondern einmal hier." }),
      refused ? el("p", { class: "notice bad", text: `Azure nimmt den Schlüssel nicht an (${refused}). Unten stehen nur die Stimmen, die keinen brauchen.` }) : null,
      chosen && !named ? el("p", { class: "notice", text: "Die gewählte Stimme gibt es auf diesem Gerät gerade nicht. Bis eine andere gewählt wird, bleibt sie gespeichert." }) : null,
      !loaded ? null
        : voices.length ? picker.node : el("p", { class: "empty", text: "keine Stimme verfügbar" }));
    picker.draw();

    const cardList = [...shown().cards.values()];
    cards.state.textContent = `${cardList.length} ${cardList.length === 1 ? "Karte" : "Karten"}`;
    if (editing.card) hold(cards.body, editing.card);
    else fill(cards.body,
      el("p", { class: "small muted", text: "Karten sind das, was zur Wahl steht: ein Bild mit NFC-Tag, das du hinlegst." }),
      el("div", { class: "rows" }, ...cardList.map(card => row(cardThumb(card), card.name,
        card.nfc ? el("code", { class: "nfc", text: card.nfc }) : el("span", { class: "row__state small muted", text: "keine Nummer" }),
        overflow(add => {
          add("Bearbeiten", () => openCard(card));
          add("Entfernen", () => void eraseCard(card), { danger: true });
        })))),
      cardList.length ? null : el("p", { class: "empty", text: "noch keine" }),
      button("＋ Neue Karte", "sm", () => openCard({ id: uuid(), name: "", updatedAt: 0 })));

    people.state.textContent = `${shown().people.length} ${shown().people.length === 1 ? "Person" : "Personen"}`;
    if (editing.person) hold(people.body, editing.person);
    else fill(people.body,
      el("div", { class: "rows" }, ...shown().people.map(person => row(face(person), person.name,
        person.birthday ? `Geburtstag ${dayLabel(person.birthday)}` : "kein Geburtstag",
        overflow(add => {
          add("Bearbeiten", () => openPerson(person));
          add("Entfernen", () => void erasePerson(person), { danger: true });
        })))),
      shown().people.length ? null : el("p", { class: "empty", text: "noch niemand" }),
      button("＋ Neue Person", "sm", () => openPerson({ id: uuid(), name: "", initials: "", tone: "", updatedAt: 0 })));

    data.state.textContent = `${shown().appointments.length} in dieser Woche`;
    fill(data.body,
      el("div", { class: "acts" },
        button("Alle Termine löschen", "sm destructive", () => void wipe(false)),
        button("Alle Daten löschen", "sm destructive", () => void wipe(true))));
  }

  /* Which fassung of a doubled symbol the search should offer first.
     Only when the folder holds more than one — a copy pointed straight at a single
     rendering has nothing to choose between, and a list with one answer is a
     question that should not have been asked. The README used to send people to
     `PNG_ohne_Rahmen` with the picker itself, which answers this by making the rest
     of the collection unreachable; this answers it by ordering. */
  function renderingChooser(): HTMLElement | null {
    const found = renderings();
    if (found.length < 2) return null;
    const named = (segment: string | null) => segment === null ? "Keine Vorgabe"
      : `${segment} · ${found.find(entry => entry.segment === segment)?.count ?? 0} Symbole`;
    const pick = dropdown(() => named(preferredRendering()), add => {
      const live = preferredRendering();
      /* Told to the provider and written down, in that order: the provider ranks the
         next search by it, and without the second half the choice lasts exactly as
         long as the tab does. */
      const choose = (segment: string | null) => () => void run(async () => {
        preferRendering(segment);
        await saveSettings({ metacomRendering: segment ?? undefined });
      }, segment ? `Darstellung „${segment}“ wird bevorzugt.` : "Keine Darstellung mehr bevorzugt.");
      add(named(null), choose(null), { checked: live === null });
      for (const entry of found) add(named(entry.segment), choose(entry.segment), { checked: live === entry.segment });
    });
    return el("div", { class: "opt" },
      field("Darstellung", pick.node),
      el("p", { class: "small muted", text: "METACOM enthält dieselben Symbole mehrfach — mit und ohne Rahmen, mit und ohne aufgedrucktes Wort. Eine Vorgabe sortiert die Suche danach; ausgeschlossen wird nichts, und was schon im Kalender steht, bleibt." }));
  }

  /* A card and a person are edited inside the panel that lists them, not in a sheet
     over this one. Both editors are nodes, and the node is what is held: `sync`
     redraws every panel on every action, and re-filling a body with the same editor
     would detach it for a frame and take the caret out of whatever was being typed.
     `hold` puts it there once and leaves it alone afterwards. */
  const editing: { card: HTMLElement | null; person: HTMLElement | null } = { card: null, person: null };
  const hold = (body: HTMLElement, editor: HTMLElement) => { if (body.firstChild !== editor) fill(body, editor); };
  const openCard = (card: Card) => {
    editing.card = cardEditor(card, async () => { editing.card = null; await load(); sync(); });
    sync();
  };
  const openPerson = (person: Person) => {
    editing.person = personEditor(person, async () => { editing.person = null; await load(); sync(); });
    sync();
  };

  const eraseCard = async (card: Card) => {
    if (await confirmDialog({ title: "Karte entfernen", body: `„${card.name}“ wird entfernt. Termine, die sie zur Wahl stellen, verlieren sie.`,
      confirmLabel: "Entfernen", cancelLabel: "Abbrechen", closeLabel: "Schließen", danger: true })) {
      await run(() => removeCard(card.id), "Karte entfernt.");
    }
  };
  const erasePerson = async (person: Person) => {
    if (await confirmDialog({ title: "Person entfernen", body: `${person.name} wird entfernt. Termine bleiben, verlieren aber diese Person.`,
      confirmLabel: "Entfernen", cancelLabel: "Abbrechen", closeLabel: "Schließen", danger: true })) {
      await run(() => removePerson(person.id), "Person entfernt.");
    }
  };
  const wipe = async (everything: boolean) => {
    if (await confirmDialog({
      title: everything ? "Alle Daten löschen" : "Alle Termine löschen",
      body: everything ? "Termine, Karten und Personen werden gelöscht. Danach ist Wochenwerk leer."
        : "Der ganze Kalender wird geleert. Karten und Personen bleiben.",
      confirmLabel: everything ? "Alles löschen" : "Termine löschen", cancelLabel: "Abbrechen", closeLabel: "Schließen", danger: true,
    })) {
      await run(() => everything ? clearAll() : clearAppointments().then(() => undefined), "Gelöscht.");
    }
  };
  sync();
  /* The key is in the database, so this one heading cannot be answered on the frame
     the dialog opens. It says it is fetching rather than saying nothing: a state is
     what the heading is for, and empty is not one. */
  speech.state.textContent = "Wird geladen …";
  void drawSpeech();
  void readVoices();
}
