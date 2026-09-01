import { el, field, fill, input } from "../ui.js";
import { caveats, factsOf, labelOf, type Voice } from "../voices.js";

/**
 * The list the calendar's one voice is chosen from.
 *
 * One choice with several answers, so the rows are radios and not toggles that
 * happen to agree — a reader should hear „2 von 6" rather than infer the
 * exclusivity from the drawing. That is bildhaft's source picker and mitreden's
 * voice picker, and it is the same control here for the same reason.
 *
 * **It is the family's picker: a field you narrow it with, and a list that
 * scrolls in a box of its own.** This started without one, on the argument that
 * asking stimmquelle for German only leaves a list short enough to read, with the
 * recommended ones leading and the rest behind „Mehr Stimmen". Three German
 * voices ship, so that was true — right up to the moment somebody adds an Azure
 * key, which is the only reason to add one. Then it is thirty, and both halves of
 * the argument failed at once: `recommended` is stimmquelle's editorial pick
 * within its own piper catalogue and is hard-coded false for every cloud voice, so
 * the fold hid the entire catalogue a key had just unlocked, and the short list it
 * was protecting had stopped being short anyway.
 *
 * So the fold is gone rather than fixed. A list you can type into does the job it
 * was doing and does it under search as well as before it, which a fold cannot —
 * mitreden and vorlaut both landed here, and neither has one.
 *
 * Every row can be heard before it is picked, which is vorlaut's ▶ and not
 * mitreden's list — and it is here now only because there is something to play:
 * the board's own speech path, one fixed sentence through it, and the same
 * interruption rule, so a second press takes the speaker off the first.
 *
 * What is still deliberately missing is mitreden's language chips: this asks for
 * German and nothing else, so every chip would say Deutsch.
 */
export interface VoiceChoice {
  node: HTMLElement;
  /** Redraw against whatever `voices()` and `current()` now answer. */
  draw(): void;
}

export interface VoiceChoiceSpec {
  voices: () => readonly Voice[];
  current: () => string | undefined;
  pick: (id: string) => void;
  /** Speak the sample in this voice. Reports what it is doing through `share`,
   *  and reports its own trouble: nothing is thrown back here. */
  hear: (voice: Voice, onProgress: (share: number) => void) => Promise<void>;
}

export function voiceChoice(spec: VoiceChoiceSpec): VoiceChoice {
  /* Somebody's place in the list, so it is held here rather than passed in: a
     settings dialog that repaints for an unrelated panel must not empty it. */
  let query = "";

  /* Built once and never replaced — only the rows under it are. A field rebuilt
     on every keystroke loses the caret, which is the bug symbol-search.ts carries
     the same note about. */
  const search = input("search", { attrs: { placeholder: "z. B. Katja, Azure, weiblich", autocomplete: "off" } });
  const list = el("div", { class: "voices", attrs: { role: "radiogroup", "aria-label": "Stimme" } });
  const node = el("div", { class: "stack" }, field("Stimme suchen", search), list);

  /* Searched on exactly what the row shows: the name it is labelled with and the
     facts line under it. A list that answers to something invisible — a locale
     code, an id — looks like it is ignoring what was typed, and one that will not
     answer to „Azure" or „weiblich" when both are printed on the row looks the
     same way.

     The label is taken against the whole catalogue rather than against the rows
     currently on screen, and that is the one place the two are deliberately
     allowed to differ. `labelOf` drops the tier once a search has removed the twin
     that made it ambiguous, so matching what is drawn would make „Thorsten (high)"
     unfindable by typing „high": the tier is on the row until the moment the query
     that names it takes it off. Against the full list every name that can ever
     appear is reachable, which is the direction to be wrong in. */
  const matches = (among: readonly Voice[]) => (voice: Voice) =>
    !query || `${labelOf(voice, among)} ${factsOf(voice)}`.toLowerCase().includes(query);

  /* Hearing a voice and choosing it are two decisions, and the first must not
     commit to the second. So a row is two buttons in a wrapper rather than one
     button — which is also the only way it can be: a button inside a button is
     not something a browser will render. vorlaut's shape, for vorlaut's reason. */
  async function hear(voice: Voice, press: HTMLButtonElement, name: string): Promise<void> {
    const idle = press.textContent;
    press.disabled = true;
    press.textContent = "…";
    press.setAttribute("aria-label", `${name} wird abgespielt`);
    /* A piper voice arrives as a 63 MB download on its first sentence, and a
       button that sits there saying nothing for a minute is a button somebody
       presses again. Whole per cent, because it is a number read at a glance. */
    try { await spec.hear(voice, share => { press.textContent = share > 0 && share < 1 ? `${Math.round(share * 100)}` : "…"; }); }
    finally {
      press.disabled = false;
      press.textContent = idle;
      press.setAttribute("aria-label", `${name} probehören`);
    }
  }

  function voiceRow(voice: Voice, live: boolean, among: readonly Voice[]): HTMLElement {
    const notes = caveats(voice);
    const name = labelOf(voice, among);
    const play = el("button", {
      class: "btn quiet play", text: "▶",
      attrs: { type: "button", "aria-label": `${name} probehören`, title: "Probe hören" },
      on: { click: () => void hear(voice, play, name) },
    });
    /* No `--live` class beside it: `aria-checked` is the state, and the paint hangs
       off that attribute in the stylesheet, so the two cannot disagree. */
    const pick = el("button", {
      class: "voice",
      attrs: { type: "button", role: "radio", "aria-checked": live },
      on: { click: () => spec.pick(voice.id) },
    },
      el("span", { class: "voice__name", text: name }),
      el("span", { class: "voice__facts small muted", text: factsOf(voice) }),
      ...notes.map(note => el("span", { class: "voice__hint small", text: note })));
    /* Roving tabindex: Tab leaves the group rather than walking every row of it. */
    pick.tabIndex = live ? 0 : -1;
    pick.dataset.id = voice.id;
    return el("div", { class: "voiceRow" }, play, pick);
  }

  function draw(): void {
    const live = spec.current();
    /* Two lists, and the difference is deliberate: the rows are labelled against
       what is on screen — `labelOf`'s whole point is that ambiguity is a fact about
       the list somebody is reading — while the search matched against the whole
       catalogue, for the reason given up there. */
    const all = spec.voices();
    const shown = all.filter(matches(all));
    fill(list, ...(shown.length
      ? shown.map(voice => voiceRow(voice, voice.id === live, shown))
      : [el("p", { class: "empty", text: "Keine Stimme passt dazu." })]));
    /* Nothing is chosen on a first run, and searching can hide the one that is: a
       group the keyboard cannot enter at all is worse than one whose entry point
       is not the answer. */
    if (!list.querySelector('.voice[tabindex="0"]')) list.querySelector<HTMLElement>(".voice")?.setAttribute("tabindex", "0");
  }

  search.addEventListener("input", () => {
    query = search.value.trim().toLowerCase();
    draw();
  });

  /** Arrow keys move the choice, as they do in any radio group. */
  list.addEventListener("keydown", event => {
    const key = (event as KeyboardEvent).key;
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(key)) return;
    const rows = [...list.querySelectorAll<HTMLElement>(".voice")];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || !rows.length) return;
    event.preventDefault();
    const to = key === "Home" ? 0
      : key === "End" ? rows.length - 1
        : key === "ArrowDown" || key === "ArrowRight" ? (at + 1) % rows.length
          : (at - 1 + rows.length) % rows.length;
    const next = rows[to]!;
    next.focus();
    spec.pick(next.dataset.id ?? "");
  });

  draw();
  return { node, draw };
}
