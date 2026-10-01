import { addDays, allDay, clock, iso, minute, titleOf, type Appointment, type Series, type SymbolRef } from "../model.js";
import { uuid } from "../db.js";
import { shown } from "../store.svelte.js";
import { birthdayOf, birthdaySheet } from "./birthday.svelte.js";
import { openSheet } from "@lautstark/design/svelte/sheet";
import { CLOSE } from "../views/dialog.js";
import type { Kind } from "./scope.svelte.js";
import AppointmentHead from "./AppointmentHead.svelte";
import AppointmentBody from "./AppointmentBody.svelte";
import AppointmentFoot from "./AppointmentFoot.svelte";

export type Repeat = "none" | "daily" | "weekly" | "yearly";

export const blankAppointment = (date: string, start?: string): Appointment => ({
  id: uuid(), date, start, end: start ? clock(minute(start) + 30) : undefined,
  symbols: [], options: [], people: [], showPeople: false, updatedAt: 0,
});

/**
 * What the sheet is editing, shared by its head, body and foot.
 *
 * A class rather than a `$state({…})` object, and the reason is who owns it.
 * The three components are handed it as a prop by `@lautstark/design`'s
 * `Imperative`, without `bind:`, and they write to it — that is what it is for:
 * the body sets `save` and `canSave`, the foot presses them, the head types the
 * title. Svelte's ownership check reads a write through a prop into a `$state`
 * proxy as a child reaching into its parent's state behind its back, and said so
 * in the console on nearly every keystroke (`ownership_invalid_mutation`). It
 * was right about the shape and wrong about this case: the parent it named is
 * the package's frame, which neither owns this nor reads it. A class owns its
 * own fields — writing one is calling its setter, not mutating somebody else's
 * proxy — so what the warning was guarding against cannot happen here, and the
 * object says in its type who it belongs to.
 *
 * Every field that is written is written whole, so they are `$state.raw` — the
 * family's shape for a store that is replaced rather than edited. The one
 * exception is `draft`, which is the record being typed into: each control
 * writes one property of it in place, and the template reads it deeply, so it
 * stays the deep `$state` it always was and leaves through `$state.snapshot`.
 */
export class Editing {
  readonly appointment: Appointment;
  readonly existing: boolean;
  readonly done: () => void;
  readonly batch: Series | undefined;
  /* A daily batch of all-day appointments is a stretch of days and not a
     repetition: nothing distinguishes „von Montag bis Freitag" from „jeden Tag,
     bis Freitag" once it is written, and nothing needs to — they are the same
     five days. Everything else is a rule, and is asked about as one. */
  readonly stretch: boolean;
  /* Where this one sits in the batch is where it was written, not what the day
     field currently says. */
  readonly anchor: string;
  draft: Appointment = $state({} as Appointment);
  mode = $state.raw<"symbols" | "choice">("symbols");
  repeat = $state.raw<Repeat>("none");
  weekly = $state.raw<number[]>([]);
  counts = $state.raw({ from: 0, all: 0 });
  /* The fields, held apart from the draft until the body copies them in. */
  title = $state.raw(""); speech = $state.raw(""); date = $state.raw(""); from = $state.raw(""); to = $state.raw("");
  spanTo = $state.raw(""); until = $state.raw("");
  whole = $state.raw(false); notHome = $state.raw(false); showPeople = $state.raw(false);
  searching = $state.raw(false); making = $state.raw(false); foldOpen = $state.raw(false);
  /* What the other half was holding, so that flipping can be flipped back. */
  priorSymbols = $state.raw<SymbolRef[]>([]); priorOptions = $state.raw<string[]>([]);
  /* Set by the body, pressed by the foot. */
  canSave = $state.raw(false);
  save = $state.raw<() => Promise<void>>(async () => {});
  erase = $state.raw<() => Promise<void>>(async () => {});

  constructor(appointment: Appointment, existing: boolean, done: () => void) {
    const draft = structuredClone(appointment);
    /* A batch brings its own rule into the dialog rather than an empty one, so
       what stands there is what is stored, and changing it changes that. */
    const batch = draft.series ? shown().series.get(draft.series) : undefined;
    this.appointment = appointment;
    this.existing = existing;
    this.done = done;
    this.batch = batch;
    this.stretch = batch?.pattern.kind === "daily" && batch.allDay;
    this.anchor = appointment.date;
    this.draft = draft;
    this.mode = draft.options.length ? "choice" : "symbols";
    this.repeat = batch ? batch.pattern.kind : "none";
    this.weekly = batch?.pattern.kind === "weekly" ? [...batch.pattern.weekdays]
      : [(new Date(`${draft.date}T00:00`).getDay() + 6) % 7];
    this.title = draft.title ?? "";
    this.speech = draft.speech ?? "";
    this.date = draft.date;
    this.from = draft.start ?? "09:00";
    this.to = draft.end ?? "09:30";
    /* Wo die Strecke aufhört, nicht wo dieser eine Tag ist: bei einem Batch ist
       das die Ausdehnung, die es schon gibt, und bei einem einzelnen Tag ist der
       Tag selbst der Vorschlag. */
    this.spanTo = this.stretch ? batch!.until : draft.date;
    /* Where a repetition would stop if one is asked for: the batch's own end,
       or eight weeks out for an appointment that is not one yet. Set here, once,
       rather than by the body on its first draw — it is what the sheet opens
       with, not something the body works out. */
    this.until = batch ? batch.until : iso(addDays(new Date(`${draft.date}T00:00`), 55));
    this.whole = allDay(draft);
    this.notHome = !!draft.away;
    this.showPeople = draft.showPeople;
    /* Arriving at a choice is the other way into that state, and there the list is
       the whole of the block — so it stands open rather than as a summary of itself. */
    this.foldOpen = draft.options.length > 0 && !draft.chosen;
    this.priorSymbols = [...draft.symbols];
    this.priorOptions = [...draft.options];
  }

  shapeOfBatch(): Kind { return this.stretch ? "stretch" : "series"; }
}

export function editAppointment(appointment: Appointment, existing: boolean, done: () => void) {
  /* A birthday has nothing this form can safely change — see birthday.svelte.ts.
     The branch is here rather than at the call site so that every way into the
     editor goes through it, including one somebody adds later. */
  const born = existing ? birthdayOf(appointment, shown().people) : [];
  if (born.length) return birthdaySheet(appointment, born);

  const s = new Editing(appointment, existing, done);

  /* A thunk, because this sheet is named after what is in it and the name is
     typed while it stands open. `Sheet` re-reads it, so the accessible name
     follows the draft — which is what it has always done, but by the frame's own
     mechanism instead of by the head reaching in and rewriting the attribute.
     Five e2e cases find this dialog by its current name. conventions.md §6.1. */
  openSheet({
    title: () => titleOf(s.draft, shown().cards, shown().people) || "Neuer Termin",
    closeLabel: CLOSE, panels: true,
    state: s, head: AppointmentHead, body: AppointmentBody, foot: AppointmentFoot,
  });
}
