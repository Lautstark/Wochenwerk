/* What the board holds between draws, and what a card at the slot does to it.
   Board.svelte reads `view`; everything here writes it. */
import { addDays, allDay, iso, mondayOf, reading, type Appointment, type Card } from "../model.js";
import { allCards, put, week } from "../db.js";
import { answered, asking, refused } from "../announce.js";
import { announceAt, preview } from "../speech.js";
import { assemble, pending, type Built } from "./layout.js";

/* Held as moments rather than applied once, because the board redraws on the
   minute boundary and a refusal, a flare or a sentence may straddle one. */
export const flareLasts = 1500;
export const refusalLasts = 1400;
/* How long a question stays asked, so that one taken back a moment after the last
   one is not asked twice. The same window the refusal answers one question in. */
const askAgainAfter = 6000;

export const view = $state({
  built: null as Built | null,
  /* Which card the voice is on. Held rather than only applied, because the board
     rewrites itself on every minute boundary and a sentence outlives that: without
     this the light would go out mid-word, at a moment that has nothing to do with
     the announcement. */
  lit: undefined as string | undefined,
  /* A card that answers nothing: nothing is saved, and the refusal is visible from
     across the room. It is shown on the bar rather than on the card, because the bar
     is where the question is — and where there is no question the bar itself says no. */
  wrong: false,
  /* Where, when, and which way round a card last moved, so the flare over the slot
     survives the minute boundary the same way the refusal does. */
  taken: { at: 0, day: 1, back: false },
  /* Bumped whenever a moment-based mark should be looked at again. */
  stamp: 0,
  readerGone: false,
  /* Whatever an announcement could not do, for whoever is setting the board up —
     never for the child, which is why it is small, in a corner, and says nothing
     at all when there is nothing wrong. */
  trouble: "",
});

export const trouble = (words?: string) => { view.trouble = words ?? ""; };

/* The two marks that live outside the board's own markup. */
export function wire(app: HTMLElement): void {
  $effect.root(() => {
    /* The rest of the week steps back while one card is spoken about, and the
       board says so rather than the stylesheet working it out with :has(). Two
       reasons, and the second is the one that decided it: :has() appears nowhere
       else in this product, and the board runs on a thin client whose browser is
       whatever that machine was given — a selector that silently matches nothing
       there would take the whole effect with it, on the one screen nobody is
       watching a console on. A class is a fact the page states. */
    $effect(() => { app.classList.toggle("hushed", Boolean(view.lit)); });
    /* The setup line lives outside `#app`, because `#app` is the board's, and
       it says nothing at all when there is nothing wrong. */
    const setup = document.body.appendChild(document.createElement("p"));
    setup.className = "setup";
    $effect(() => { setup.textContent = view.trouble; });
  });
}

export async function draw(at: Date): Promise<void> {
  view.built = await assemble(at);
  if (Date.now() - refusedAt < refusalLasts) view.wrong = true;
}

/* Redraw on every minute boundary rather than on an interval, so the board never
   drifts away from the wall clock and a resumed kiosk catches up immediately. The
   same tick re-reads the store, which is how a change made in the calendar arrives. */
export async function tick(): Promise<void> {
  const at = new Date();
  await draw(at);
  setTimeout(tick, 60_000 - (at.getSeconds() * 1000 + at.getMilliseconds()) + 20);
}

function flare(day: string, back: boolean) {
  view.taken = { at: Date.now(), day: ((new Date(`${day}T00:00`).getDay() + 6) % 7) + 1, back };
  /* Once to light it, once to put it out. */
  setTimeout(() => void draw(new Date()).then(() => { view.stamp += 1; }), flareLasts);
}

let refusedAt = 0, refusedSaid = 0, refusedCard = "";
let askedAgain = 0;

/* What a card is called out loud: what it was given to say when it is offered, and
   its name where it was given nothing. */
const spokenAs = (card: Card) => card.speech?.trim() || card.name;

function refuse(open: Appointment | undefined, cards: Map<string, Card>, uid: string, card?: Card) {
  /* A tag nobody has written down anywhere is a setup state rather than a mistake
     by the child, and the number is the one thing whoever is setting it up needs.
     It goes in the quiet line — before anything else here, because registering a
     card is exactly the moment when no question is open and the rest of this
     function has nothing to do. */
  if (!card) trouble(`Unbekannte Karte: ${uid}`);
  refusedAt = Date.now();
  view.wrong = true;
  setTimeout(() => {
    if (Date.now() - refusedAt >= refusalLasts) view.wrong = false;
  }, refusalLasts);

  /* And it is said, because a card held against the reader is a question asked out
     loud and deserves an answer in kind: what this one is not, and what would do
     instead. Only where a question is actually open — with nothing to choose there
     is nothing to offer, and a sentence listing nothing is worse than silence.

     The same door the calendar speaks a single line through; it stops whatever was
     being said, which is right here, since the child is standing at the slot. */
  const offered = open?.options.map(id => cards.get(id)).filter(Boolean) as Card[] | undefined;
  if (!offered?.length) return;
  /* A card held there for a moment reads several times. It is one question, so it
     gets one answer. */
  const again = uid === refusedCard && Date.now() - refusedSaid < askAgainAfter;
  refusedCard = uid;
  if (again) return;
  refusedSaid = Date.now();
  void preview(refused(card && spokenAs(card), offered.map(spokenAs)).text).then(why => { if (why) trouble(why); });
}

/* The card in the slot is the answer, for as long as it lies there — taking it out
   takes the answer back. That holds until the appointment begins; from then on it
   is not a plan any more but what is happening, and the board keeps it. Otherwise
   an afternoon that was ridden through would turn back into a question the moment
   the card was tidied away, and next week's board would show a question mark over
   a day that no longer had one. */
const ahead = (appointment: Appointment, at: Date, now: string) =>
  appointment.date > iso(at) || (appointment.date === iso(at) && !allDay(appointment) && appointment.start! > now);

/* A tag's number is written down in whatever shape the thing that read it produced,
   and every one of those shapes is the same number: the calendar upper-cases what
   somebody types, this reader hands out lower case, and people paste them with
   colons, spaces or dashes in between. So neither side's spelling is compared —
   only the hex digits, which is the part that is actually the tag.

   A card may carry several of them, separated by commas. One picture is often more
   than one object in a household — the same choice laminated twice, or a card that
   lost its sticker and got a new one — and those are one card with two tags rather
   than two cards that would both have to be offered. */
const bare = (uid: string) => uid.toLowerCase().replace(/[^0-9a-f]/g, "");
const tagsOf = (written: string) => written.split(",").map(bare).filter(Boolean);
const sameTag = (written: string | undefined, read: string) => !!written && tagsOf(written).includes(bare(read));

/* Which card lies on the reader. Presence is a fact about the room rather than a
   record: it lives as long as this page does, and the only thing written from it
   is the option a choice was answered with. */
let inSlot: string | undefined;
export async function reads(uid: string | null): Promise<void> {
  const at = new Date(), now = reading(at);
  const appointments = await week(mondayOf(at));
  if (uid) {
    const cardList = await allCards();
    const card = cardList.find(item => sameTag(item.nfc, uid));
    const open = pending(appointments, iso(at), iso(addDays(at, 1)), now);
    /* Only a card the question offers answers it. Anything else is refused, and
       one that is already the answer is not written a second time. */
    if (!card || !open || !open.options.includes(card.id)) {
      return refuse(open, new Map(cardList.map(item => [item.id, item])), uid, card);
    }
    inSlot = card.id;
    if (open.chosen === card.id) return;
    await put({ ...open, chosen: card.id });
    flare(open.date, false);
    /* And it is said back, through the same door the refusal answers through. The
       light over the slot says that something arrived; only the sentence says
       which card was understood, which is the whole of what a child cannot check
       from across the room when two cards look alike. Said once per answer: a
       card lying there reads over and over, and the line above returns on every
       read after the first. */
    void preview(answered(spokenAs(card)).text).then(why => { if (why) trouble(why); });
  } else {
    /* No reader is not no card. A reader that was unplugged would otherwise
       withdraw every answer at once, which is the one failure that would reach the
       child — belt and braces, since a bridge that is gone sends nothing at all. */
    if (view.readerGone) return;
    const card = inSlot;
    inSlot = undefined;
    /* Nothing was lying there as far as this page knows — which is the state a fresh
       connection reports before anything has happened on it. Without this, `chosen`
       of `undefined` matches every appointment nobody has answered, and the first
       one of those gets "withdrawn": a write that changes nothing, and a light over
       the slot saying something was taken back that was never given. */
    if (!card) return;
    const decided = appointments.find(item => item.chosen === card && ahead(item, at, now));
    if (!decided) return;
    const { chosen: _withdrawn, ...rest } = decided;
    await put(rest);
    /* Taking it back gets the same light in the same place, running the other way:
       the question is standing there again, and it happened at the slot. */
    flare(decided.date, true);
    /* And it is asked again, in the clip the open choice already ends on — the
       answer had a voice, so taking it back has one too. Not on every jiggle: a
       card going in and out is one child playing, and a board that asks again
       each time is talking to itself. */
    if (Date.now() - askedAgain > askAgainAfter) {
      askedAgain = Date.now();
      void preview(asking().text).then(why => { if (why) trouble(why); });
    }
  }
  await draw(at);
}

/* The announcement is asked for, never volunteered. A key is what asks today:
   ADR 002 has the reader arriving as an ordinary USB keyboard that types a tag's
   UID, so a keypress is the door that input will come through as well, and the
   button in the frame is the same door with no card in front of it.

   Space, because a keypad or a single wired switch is what a button in a frame
   is, and space is what one of those sends before it is configured to send
   anything else. A modifier means somebody is at a real keyboard doing something
   else, so it is left alone.

   And the knob, because the button that ended up in front of the board is a USB
   volume dial: pressing it sends the system's mute key, turning it sends volume
   up and down. It cannot be told to send anything else — there is no software to
   tell it with — so the board learns its keys instead. Two of them ask for the
   announcement and two are swallowed, which is the whole vocabulary the hardware
   has.

   *Turning does nothing on purpose.* The dial sits at a child's height under a
   board whose entire job is to talk, and volume is not a setting a two-year-old
   should be able to change by leaning on it — least of all down to nothing, which
   looks exactly like a board that has broken. Swallowed rather than left alone,
   because a key nobody handles is a key the browser hands on.

   What that promise cannot cover: `preventDefault` binds the browser and nothing
   above it. Where the machine acts on these keys before the page is asked — macOS
   does, at the driver — the volume moves whatever this file says, and the fix has
   to be made there. Under Chromium in kiosk, which is what the wall runs, there
   is no desktop above the browser to take them first. */
const PRESS = new Set(["Space", "AudioVolumeMute", "VolumeMute"]);
const TURN = new Set(["AudioVolumeUp", "AudioVolumeDown", "VolumeUp", "VolumeDown"]);
export function pressed(event: KeyboardEvent): void {
  /* Before the guards below rather than after: turning the dial fast repeats, and
     a repeat that reaches the browser is a repeat that moves the volume. */
  if (TURN.has(event.code)) { event.preventDefault(); return; }
  if (!PRESS.has(event.code) || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  event.preventDefault();
  /* Cleared before rather than after: a sentence takes seconds to speak, and a
     line about what went wrong last time is still on the wall for all of them. */
  trouble();
  void announceAt(new Date(), id => { view.lit = id; }).then(said => trouble(said.trouble));
}
