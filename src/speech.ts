import { asBlob, remember, say, usePiperRuntime, type OnnxModule } from "@lautstark/stimmquelle";
import { piperRuntime } from "@lautstark/stimmquelle/runtime";
import { announce, type Utterance } from "./announce.js";
import { allCards, allPeople, clips, settings, week } from "./db.js";
import { mondayOf } from "./model.js";

/* Saying an announcement out loud. What is said is `announce.ts`; this is only
   how it reaches a speaker.

   docs/speech.md decides that a sentence is played as the clips it is made of,
   recorded once and reused. Nothing is recorded yet, so every sentence is
   synthesised whole and kept under its own name — which the same document allows
   in as many words, because the derivation hands out both the parts and the text.
   When the clips exist they replace this one utterance at a time, and the fifty-
   five fixed ones replace themselves everywhere at once. */

/* piper is driven here rather than through vits-web's `predict()`, which is what
   makes `de_DE-kerstin-low` speakable — vits-web phonemises against one fixed
   symbol table, and every `low` model gets ids its own table has never seen. In
   German that is every female voice piper publishes. `onnx` stays ours: bundled
   rather than fetched, because the board hangs on a wall and a page that needs a
   host at the moment a child presses a key is not a page for this. */
let piperReady = false;
function readyPiper() {
  if (piperReady) return;
  /* The cast is onnxruntime's own `wasmPaths` union against the single string
     stimmquelle asks for; mitreden carries the same one. */
  usePiperRuntime(piperRuntime({
    onnx: () => import("onnxruntime-web/wasm") as unknown as Promise<OnnxModule>,
    dir: "wasm", base: import.meta.env.BASE_URL,
  }));
  piperReady = true;
}

/* One press interrupts what the last one started. A child presses again because
   they want it again, never because they want two of them queued — and a queue
   is how a button becomes something you have to wait out. */
let generation = 0;
let playing: HTMLAudioElement | null = null;
function stop() {
  generation++;
  playing?.pause();
  playing = null;
  /* System voices are the platform's queue, not ours, and it keeps speaking
     across a page's own bookkeeping unless it is told. */
  globalThis.speechSynthesis?.cancel();
}

const sound = (blob: Blob, mine: number) => new Promise<void>(done => {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  playing = audio;
  const finish = () => { URL.revokeObjectURL(url); if (playing === audio) playing = null; done(); };
  audio.addEventListener("ended", finish, { once: true });
  audio.addEventListener("error", finish, { once: true });
  void audio.play().catch(finish);
  /* A press that landed while this one was loading owns the speaker now. */
  if (generation !== mine) { audio.pause(); finish(); }
});

/* A system voice returns no samples — the Web Speech API hands out no file — so
   there is nothing to trim, level, cache or ever put on a talker. It is the one
   backend that cannot be prepared ahead of time, and the one that costs nothing
   to try. `speak` refuses a `system:` id rather than inventing audio with no
   sound in it, so the two are asked differently on purpose. */
async function utter(text: string, voice: string, mine: number, onProgress?: (share: number) => void): Promise<void> {
  if (voice.startsWith("system:")) return say(text, voice);
  if (voice.startsWith("piper:")) readyPiper();
  const { wav } = await remember(clips, text, voice, {
    ...await spoken(),
    /* Only the share, because that is all a caller can draw. A piper voice is
       63 MB on its first sentence and silent while it arrives, which is long
       enough to read as a button that did nothing. */
    ...(onProgress ? { onProgress: (p: { share: number }) => onProgress(p.share) } : {}),
  });
  if (generation !== mine) return;
  return sound(asBlob(wav), mine);
}

/* Azure is asked with the household's own key, from the tab, and the key never
   leaves this browser — see stimmquelle's CONTRACT.md §8. Whether Azure is even
   reachable is not asked here: a refused key throws at the sentence, which is
   where a person can be told about it. */
const spoken = async () => {
  const { azure } = await settings();
  /* `ownsInference` again, and this is the second of the two doors stimmquelle's
     README names: being listed and being allowed to speak are separate questions,
     asked in separate places, and a product has to answer both. voices.ts claims
     it for the picker. Without the same claim here `speak()` refuses every `low`
     model — which is `de_DE-kerstin-low`, the one German female piper voice there
     is, offered in the picker and refused at synthesis. The claim is true in both
     places for the same reason: readyPiper() above drives piper itself. */
  return { ownsInference: true as const, ...(azure ? { azure } : {}) };
};

/**
 * What a voice is tried out on: the voice introducing itself, and nothing about
 * this household.
 *
 * It was a line off the board — „Jetzt ist Frühstück" — on the argument that you
 * should hear the register you are choosing for. But a preview is not the board
 * talking, it is a voice answering *what do you sound like*, and a sentence about
 * breakfast makes somebody read the words instead of listening to who is saying
 * them. Generic is also the honest choice for a household calendar: nothing here
 * is anybody's business but the household's, and a specimen that names no meal,
 * no day and no person cannot leak one.
 *
 * One fixed sentence rather than whatever the week holds at that minute, because
 * the question is which of thirty voices to take, and two voices are only
 * comparable on the same words.
 */
export const SAMPLE = "Das ist meine Stimme. So höre ich mich an.";

/**
 * One fixed sentence in one voice, so a voice can be heard before it is chosen.
 *
 * Hearing a voice and choosing it are two decisions, and the first must not
 * commit to the second — which is why this takes the voice it is handed rather
 * than the one in the settings record. It goes through the same door everything
 * else does: the same interruption rule, so a second press takes the speaker off
 * the first, and the same clip cache, so listening to a voice twice asks the
 * network or the synthesiser once.
 */
export async function hearSample(voice: string, onProgress?: (share: number) => void): Promise<void> {
  stop();
  const mine = ++generation;
  await utter(SAMPLE, voice, mine, onProgress);
}

/** What the board would say at this moment, without saying it. */
export async function saying(at: Date): Promise<Utterance[]> {
  const [appointments, people, cards] = await Promise.all([week(mondayOf(at)), allPeople(), allCards()]);
  return announce(appointments, at, {
    cards: new Map(cards.map(card => [card.id, card])),
    people: new Map(people.map(person => [person.id, person])),
  });
}

/**
 * Hear one word, for whoever is deciding what will be said.
 *
 * The board is where an announcement belongs and the calendar is where the words
 * are written, so this is the one place the calendar makes a sound: asked for by
 * a person, about a single word, never about the day.
 *
 * It shares the board's cache and its voice, and a word heard twice is spoken
 * once. It does not yet pay for the board's own sentences: the fingerprint is
 * over the text, and today the board renders "Danach kommt Turnen." whole rather
 * than as a frame and a word, so the two are different names for different files.
 * They become the same file the moment playback plays clips — which is what
 * docs/speech.md is written towards, and this is already the door the household's
 * half of that vocabulary is recorded through.
 */
export async function preview(text: string): Promise<string | undefined> {
  stop();
  const mine = ++generation;
  const said = text.trim();
  if (!said) return undefined;
  const { voice } = await settings();
  if (!voice) return "Noch keine Stimme gewählt — Einstellungen → Stimme.";
  try { await utter(said, voice, mine); }
  catch (error) { return `Das ging nicht: ${(error as Error)?.message ?? "unbekannter Fehler"}`; }
  return undefined;
}

export type Announced = { lines: string[]; trouble?: string };
/** Which appointment is being talked about right now, or nothing between them. */
export type Showing = (id: string | undefined) => void;

/**
 * Say it. Two or three sentences, in order, and a press during them starts again.
 *
 * The trouble it reports is for whoever is setting the board up and never for the
 * child: no voice chosen yet, or a voice that would not speak. The board has one
 * quiet line for exactly that, the same one the missing symbol folder uses.
 */
export async function announceAt(at: Date, showing: Showing = () => {}): Promise<Announced> {
  stop();
  showing(undefined);
  const mine = ++generation;
  const lines = await saying(at);
  const { voice } = await settings();
  if (!voice) return { lines: lines.map(line => line.text), trouble: "Noch keine Stimme gewählt — Kalender → Einstellungen → Stimme." };
  for (const line of lines) {
    if (generation !== mine) break;
    /* Lit while it is being said and let go the moment it is not, so the two
       cannot drift apart: a card still lit under the following sentence points
       at the wrong thing, which is worse than pointing at nothing. */
    showing(line.about);
    try { await utter(line.text, voice, mine); }
    catch (error) {
      /* Stop at the first one that will not speak. Carrying on would say the
         second half of an announcement whose first half nobody heard, which is
         worse than silence: the child is told what comes next and not what is. */
      showing(undefined);
      return { lines: lines.map(item => item.text), trouble: `Die Ansage ging nicht: ${(error as Error)?.message ?? "unbekannter Fehler"}` };
    }
  }
  /* Only where this press still owns the speaker: a newer one has already put its
     own card up, and clearing here would take that one down again. */
  if (generation === mine) showing(undefined);
  return { lines: lines.map(line => line.text) };
}
