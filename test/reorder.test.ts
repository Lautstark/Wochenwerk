import { describe, expect, it } from "vitest";
import { moved } from "../src/views/reorder.js";

/* The drag itself is DOM and is not tested here; where a symbol lands is
   arithmetic, and it is the part that is easy to get wrong by one. */
describe("moved", () => {
  it("carries an item forward and closes the gap behind it", () => {
    expect(moved(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("carries an item back", () => {
    expect(moved(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("leaves the list alone when nothing moves", () => {
    expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("gives back a new list rather than editing the one it was handed", () => {
    const before = ["a", "b"];
    expect(moved(before, 0, 1)).toEqual(["b", "a"]);
    expect(before).toEqual(["a", "b"]);
  });
});
