import { el, fill } from "../ui.js";
import { caveats, factsOf, type Voice } from "../voices.js";

/**
 * The list the calendar's one voice is chosen from.
 *
 * One choice with several answers, so the rows are radios and not toggles that
 * happen to agree — a reader should hear „2 von 6" rather than infer the
 * exclusivity from the drawing. That is bildhaft's source picker and mitreden's
 * voice picker, and it is the same control here for the same reason.
 *
 * **What it does not have is mitreden's search field and language chips.** Those
 * exist because a Sammlung's voice is chosen out of hundreds once an Azure key is
 * in, and because that page speaks more than one language. This one asks
 * stimmquelle for German only, so the list is short enough to read, and the four
 * recommended lead it with everything else behind „Mehr Stimmen".
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
}

export function voiceChoice(spec: VoiceChoiceSpec): VoiceChoice {
  /* Whether the ones stimmquelle has no editorial opinion about are shown. Kept
     here rather than passed in: it is somebody's place in a list, and a settings
     dialog that folded it away again on every repaint would lose that place. */
  let all = false;

  const list = el("div", { class: "voices", attrs: { role: "radiogroup", "aria-label": "Stimme" } });
  const more = el("div", { class: "acts" });
  const node = el("div", { class: "stack" }, list, more);

  function voiceRow(voice: Voice, live: boolean): HTMLElement {
    const notes = caveats(voice);
    const row = el("button", {
      class: `voice${live ? " voice--live" : ""}`,
      attrs: { type: "button", role: "radio", "aria-checked": live },
      on: { click: () => spec.pick(voice.id) },
    },
      el("span", { class: "voice__name", text: voice.name }),
      el("span", { class: "voice__facts small muted", text: factsOf(voice) }),
      ...notes.map(note => el("span", { class: "voice__hint small", text: note })));
    /* Roving tabindex: Tab leaves the group rather than walking every row of it. */
    row.tabIndex = live ? 0 : -1;
    row.dataset.id = voice.id;
    return row;
  }

  function draw(): void {
    const voices = spec.voices();
    const live = spec.current();
    const lead = voices.filter(voice => voice.recommended);
    const rest = voices.filter(voice => !voice.recommended);
    /* The four are stimmquelle's editorial pick, one per language-and-gender slot,
       and with only German asked for they are one or two. If it has no opinion
       about any of them — a machine offering nothing but its own voices — there is
       nothing to lead with and the fold would hide the whole list. */
    const shown = all || !lead.length ? [...lead, ...rest]
      /* A chosen voice from behind the fold still shows: a group whose answer is
         not among its rows reads as having lost it. */
      : voices.filter(voice => voice.recommended || voice.id === live);

    fill(list, ...shown.map(voice => voiceRow(voice, voice.id === live)));
    fill(more, rest.length && lead.length
      ? el("button", {
        class: "btn sm quiet", attrs: { type: "button", "aria-expanded": all },
        text: all ? "Weniger Stimmen" : `Mehr Stimmen (${rest.length})`,
        on: { click: () => { all = !all; draw(); } },
      })
      : null);
    /* Nothing is chosen on a first run, and a group the keyboard cannot enter at
       all is worse than one whose entry point is not the answer. */
    if (!list.querySelector('.voice[tabindex="0"]')) list.querySelector<HTMLElement>(".voice")?.setAttribute("tabindex", "0");
  }

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
