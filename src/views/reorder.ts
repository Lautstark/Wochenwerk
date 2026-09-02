/* Putting a row of tiles in an order by dragging one of them.
 *
 * Pointer events rather than the HTML drag-and-drop API. That API is a mouse
 * feature — a finger produces no drag from it at all — and a week is planned on
 * a phone as often as on a laptop, so a drag that only works with a mouse is a
 * drag half the household does not have. The same three handlers cover mouse,
 * touch and pen; `touch-action: none` on a movable tile is the rest of touch
 * support, because without it a sideways drag is read as a scroll and the drag
 * never begins.
 *
 * The tiles are ordinary buttons that already do something when they are clicked,
 * so a press only becomes a drag once it has travelled — and the click that the
 * browser fires afterwards is swallowed, or dragging a symbol somewhere else
 * would also delete it. */

/** The same list with what stood at `from` standing at `to`, and the rest closed up. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Marks a tile as one that can be moved. The grid may hold others that cannot —
    the empty slot at the end is a button, not a symbol. */
export const movable = <T extends HTMLElement>(tile: T): T => { tile.dataset.move = ""; return tile; };

/** How far a press travels before it is a drag rather than a click. */
const GRIP = 6;

/**
 * Wires a grid so its movable tiles can be dragged into another order, and calls
 * back with the move once it is dropped. The grid keeps its own children while
 * this happens; `onMove` is what writes the new order down, and the redraw that
 * follows is what makes the DOM agree with it again.
 *
 * Arrow keys do the same thing for whoever is not holding a pointer at all: a
 * feature that only exists as a drag exists for fewer people than the ones it
 * was written for.
 */
export function reorderable(node: HTMLElement, onMove: (from: number, to: number) => void): HTMLElement {
  const tiles = () => [...node.querySelectorAll<HTMLElement>("[data-move]")];
  const under = (event: Event) => (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-move]") ?? null;

  let drag: null | {
    tile: HTMLElement; from: number; home: Node | null; grabX: number; grabY: number; going: boolean;
  } = null;

  /* Kept under the pointer by measuring rather than by counting: the tile is
     re-inserted between its neighbours as it passes them, which moves where it
     would lie, so the offset is worked out from where it lies now. */
  const follow = (tile: HTMLElement, x: number, y: number) => {
    tile.style.transform = "";
    const box = tile.getBoundingClientRect();
    tile.style.transform = `translate(${x - drag!.grabX - box.left}px, ${y - drag!.grabY - box.top}px)`;
  };

  node.addEventListener("pointerdown", event => {
    const tile = under(event);
    if (!tile || event.button !== 0) return;
    const box = tile.getBoundingClientRect();
    drag = { tile, from: tiles().indexOf(tile), home: tile.nextSibling,
      grabX: event.clientX - box.left, grabY: event.clientY - box.top, going: false };
  });

  node.addEventListener("pointermove", event => {
    if (!drag) return;
    const { tile } = drag;
    if (!drag.going) {
      const box = tile.getBoundingClientRect();
      if (Math.hypot(event.clientX - box.left - drag.grabX, event.clientY - box.top - drag.grabY) < GRIP) return;
      drag.going = true;
      tile.dataset.move = "on";
      /* Captured once it is a drag and not before: a captured pointer takes the
         click that ends it with it, and a tile that is only pressed has to keep
         its own — on this grid that click is how a symbol is taken off again.
         The grid captures rather than the tile, because the tile is out of the
         hit test while it moves. */
      node.setPointerCapture(event.pointerId);
    }
    follow(tile, event.clientX, event.clientY);
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-move]");
    if (!over || over === tile || over.parentElement !== node) return;
    /* Past a neighbour means through it: the one being dragged goes to the far
       side of whatever it is over, which is the side the pointer came from. */
    const ahead = !!(over.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING);
    node.insertBefore(tile, ahead ? over : over.nextSibling);
    follow(tile, event.clientX, event.clientY);
  });

  const finish = (event: PointerEvent, dropped: boolean) => {
    if (!drag) return;
    const { tile, from, home, going } = drag;
    drag = null;
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    tile.style.transform = "";
    tile.dataset.move = "";
    if (!going) return;
    /* A drag is not a click, but the browser says one anyway when the pointer goes
       up over a button. Taken off again on the next turn of the loop, so a press
       that ends without a click does not leave a trap for the next one. */
    const swallow = (click: Event) => { click.stopPropagation(); };
    node.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => node.removeEventListener("click", swallow, true));
    /* Cancelled is not dropped — a system gesture taking the pointer away leaves
       the order it was found in, so the tile goes back where it was picked up. */
    if (!dropped) return void node.insertBefore(tile, home);
    const to = tiles().indexOf(tile);
    if (to !== from) onMove(from, to);
  };
  node.addEventListener("pointerup", event => finish(event, true));
  node.addEventListener("pointercancel", event => finish(event, false));

  node.addEventListener("keydown", event => {
    const tile = under(event);
    const by = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!tile || !by) return;
    const order = tiles(), from = order.indexOf(tile), to = from + by;
    if (to < 0 || to >= order.length) return;
    event.preventDefault();
    onMove(from, to);
  });

  return node;
}
