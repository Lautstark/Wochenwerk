/* What both routes agree on: the calendar writes these records, the board reads
   them. Nothing here knows where they are stored. */

/** Household configuration: the visible window of a day and the planning grid. */
export const board = { from: "07:00", to: "20:30", snap: 15 };

/* A symbol is named, never embedded. For METACOM the name is the path relative to
   the household's own licensed folder, which is what `bildquelle` indexes by; for
   ARASAAC it is the pictogram number. The files of a licensed collection, an index
   of one and a count of it never travel — a reference does. See ADR 002. */
export type Source = "metacom" | "arasaac";
export type SymbolRef = { source: Source; id: string; label: string };

/* One appointment, one record, one UUID: a conflict then needs two people editing
   the same appointment rather than the same evening. See ADR 002. */
export type Appointment = {
  id: string;
  date: string;
  start: string;
  end: string;
  /* An appointment's symbol is either fixed or not decided yet. Undecided, it
     carries the options the parents allow, and an input picks one of them. */
  symbols: SymbolRef[];
  options: SymbolRef[];
  chosen?: string;
  people: string[];
  showPeople: boolean;
  updatedAt: number;
};
export type Person = { id: string; name: string; initials: string; tone: string };
/* Visit and birthday belong to whole days and carry one person each, so two guests
   are two visits and a visit may cover a range of days. */
export type Special = { id: string; kind: "visit" | "birthday"; person: string; from: string; to: string };

export const undecided = (appointment: Appointment) => appointment.options.length > 0 && !appointment.chosen;
export const shownSymbols = (appointment: Appointment): SymbolRef[] => {
  if (!appointment.options.length) return appointment.symbols;
  const picked = appointment.options.find(option => option.id === appointment.chosen);
  return picked ? [picked] : appointment.options;
};

export const minute = (time: string) => { const [hour, rest] = time.split(":").map(Number); return hour * 60 + rest; };
export const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const snapped = (time: string) => Math.round(minute(time) / board.snap) * board.snap;
export const reading = (at: Date) => `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

/** Dates are ISO so they sort, and an index over them makes a week a range query. */
export const iso = (at: Date) => `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
export const mondayOf = (at: Date) => { const start = new Date(at); start.setDate(at.getDate() - ((at.getDay() + 6) % 7)); return start; };
export const addDays = (at: Date, days: number) => { const next = new Date(at); next.setDate(at.getDate() + days); return next; };
export const weekdays = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
export const dayLabel = (date: string) => { const [, month, day] = date.split("-"); return `${Number(day)}.${Number(month)}.`; };
