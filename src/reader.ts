/* Der Leser spricht nicht mit dem Browser, sondern mit dem Rechner, an dem er
   steckt. Dazwischen liegt eine Brücke: ein kleiner Prozess auf derselben Maschine,
   der PC/SC fragt und weitersagt, was im Schlitz liegt. Sie kennt keine Termine und
   speichert nichts — ein Gerätetreiber, kein Server, und deshalb kein Widerspruch
   zu ADR 002.

   Ein Strom in eine Richtung, weil die Sache selbst eine Richtung hat: das Board
   fragt den Leser nie etwas. `EventSource` bringt dafür alles mit, was sonst von
   Hand käme — Wiederverbinden nach einem Abriss und ein Fehlerereignis in dem
   Moment, in dem die Brücke weg ist.

   Das Entprellen liegt drüben, wo das Polling ist: hier kommt nie ein verpasster
   Lesevorgang als Entnahme an. */
const bridge = "http://localhost:8765/leser";

/* Erst melden, wenn es etwas zu melden gibt. Ein Board ohne Brücke — jede
   Entwicklungsmaschine, jeder Haushalt ohne Leser — soll nicht dauerhaft „Leser
   antwortet nicht" an der Wand stehen haben; das ist kein Fehler, sondern ein
   Aufbau ohne Hardware. Erst wenn eine Brücke einmal geantwortet hat, ist ihr
   Verschwinden eine Störung. */
let everAnswered = false;

export function listen(): void {
  const stream = new EventSource(bridge);
  stream.addEventListener("open", () => {
    everAnswered = true;
    dispatchEvent(new CustomEvent("leser", { detail: true }));
  });
  stream.addEventListener("error", () => {
    if (everAnswered) dispatchEvent(new CustomEvent("leser", { detail: false }));
  });
  stream.addEventListener("message", event => {
    const { uid } = JSON.parse((event as MessageEvent<string>).data) as { uid: string | null };
    dispatchEvent(new CustomEvent("karte", { detail: uid }));
  });
}
