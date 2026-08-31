# Board layout explorations

All explorations assume 1920 × 1080 and child-distance viewing. Symbols are the units, labels are supporting.

## A. Grid: days × dayparts — chosen

```text
        Mo  Di  [Mi] Do  Fr  Sa  So
Morgen  ◼   ◼    ◼  ◼   ◼   ◼   ◼
Mittag  ◼   ◼    ◼  ◼   ◼   ◼   ◼
Nachm.  ◼   ?   ◼◼  ◼   ◼   ◼   ◼
Abend   ◼   ◼    ◼  ◼   ◼   ◼   ◼
```

**Strength:** instant weekly overview and repeatable location for every time/day. **Risk:** each slot is narrow. Mitigation: target no more than three cards and test on the actual monitor.

## B. Day cards

```text
[Mo]  Morgen ◼   [Di] Morgen ◼   [Mi] Morgen ◼
      Nachm. ◼◼        Nachm. ?         Nachm. ◼◼
      Abend  ◼          Abend  ◼          Abend  ◼
```

**Strength:** a day is a readable story. **Risk:** comparison across the week becomes slower and cards must become too small or require vertical scanning. Rejected for the first prototype.

## C. Today-led rail

```text
Mo  Di |      HEUTE: Mittwoch      | Do  Fr  Sa  So
      | Morgen ◼  Mittag ◼         |
      | NACHMITTAG ◼ ◼             |
      | Abend ◼                    |
```

**Strength:** exceptional `now` clarity. **Risk:** weakens “what happens later this week?” and creates a layout that changes emphasis every day. Worth revisiting only if real-world observation shows the grid is too dense.

## What the prototype actually became

A was built first and then outgrown. Fixed daypart rows could not express real start and end times, so the board moved to a continuous 07:00–20:30 day column in which card height carries duration — call it **A′**. It keeps A's promise (seven columns, one repeatable location per day, unresolved choices easy to find) and drops A's fixed four-row grid.

A′ inherits A's density problem in a new form: on a true time scale a fifteen-minute appointment is only a few pixels tall. Relaxing the scale to guarantee every appointment a legible minimum was tried and rejected — it flattens the difference between a fifteen-minute bike ride and a five-hour Kita morning, which is the one thing the height is there to show. The scale stays exact; a fifteen-minute appointment is allowed to be small. What compensates is the width of the current day, the size of its symbols and the strong now emphasis — see [UX decisions](../ux.md).

B and C are retained as explicit fallback directions, not as requirements. C in particular is worth revisiting only if real-world observation shows that six muted columns earn less than the room they cost.
