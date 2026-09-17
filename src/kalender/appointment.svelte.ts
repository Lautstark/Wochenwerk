import { allDay, clock, minute, titleOf, type Appointment, type Series, type SymbolRef } from "../model.js";
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

/** What the sheet is editing, shared by its head, body and foot. */
export interface Editing {
  appointment: Appointment;
  existing: boolean;
  done: () => void;
  draft: Appointment;
  batch: Series | undefined;
  /* A daily batch of all-day appointments is a stretch of days and not a
     repetition: nothing distinguishes „von Montag bis Freitag" from „jeden Tag,
     bis Freitag" once it is written, and nothing needs to — they are the same
     five days. Everything else is a rule, and is asked about as one. */
  stretch: boolean;
  shapeOfBatch: () => Kind;
  anchor: string;
  mode: "symbols" | "choice";
  repeat: Repeat;
  weekly: number[];
  counts: { from: number; all: number };
  /* The fields, held apart from the draft until `read()` copies them in. */
  title: string; speech: string; date: string; from: string; to: string; spanTo: string;
  whole: boolean; notHome: boolean; showPeople: boolean; until: string;
  searching: boolean; making: boolean; foldOpen: boolean;
  /* What the other half was holding, so that flipping can be flipped back. */
  priorSymbols: SymbolRef[]; priorOptions: string[];
  /* Set by the body, pressed by the foot. */
  canSave: boolean;
  save: () => Promise<void>;
  erase: () => Promise<void>;
}

export function editAppointment(appointment: Appointment, existing: boolean, done: () => void) {
  /* A birthday has nothing this form can safely change — see birthday.svelte.ts.
     The branch is here rather than at the call site so that every way into the
     editor goes through it, including one somebody adds later. */
  const born = existing ? birthdayOf(appointment, shown().people) : [];
  if (born.length) return birthdaySheet(appointment, born);

  const draft = structuredClone(appointment);
  /* A batch brings its own rule into the dialog rather than an empty one, so what
     stands there is what is stored, and changing it changes that. */
  const batch = draft.series ? shown().series.get(draft.series) : undefined;
  const stretch = batch?.pattern.kind === "daily" && batch.allDay;
  const s: Editing = $state({
    appointment, existing, done, draft, batch, stretch,
    shapeOfBatch: () => (stretch ? "stretch" : "series"),
    anchor: appointment.date,
    mode: draft.options.length ? "choice" : "symbols",
    repeat: batch ? batch.pattern.kind : "none",
    weekly: batch?.pattern.kind === "weekly" ? [...batch.pattern.weekdays]
      : [(new Date(`${draft.date}T00:00`).getDay() + 6) % 7],
    counts: { from: 0, all: 0 },
    title: draft.title ?? "", speech: draft.speech ?? "", date: draft.date,
    from: draft.start ?? "09:00", to: draft.end ?? "09:30",
    /* Wo die Strecke aufhört, nicht wo dieser eine Tag ist: bei einem Batch ist
       das die Ausdehnung, die es schon gibt, und bei einem einzelnen Tag ist der
       Tag selbst der Vorschlag. */
    spanTo: stretch ? batch!.until : draft.date,
    whole: allDay(draft), notHome: !!draft.away, showPeople: draft.showPeople, until: "",
    searching: false, making: false,
    /* Arriving at a choice is the other way into that state, and there the list is
       the whole of the block — so it stands open rather than as a summary of itself. */
    foldOpen: draft.options.length > 0 && !draft.chosen,
    priorSymbols: [...draft.symbols], priorOptions: [...draft.options],
    canSave: false,
    save: async () => {}, erase: async () => {},
  });

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
