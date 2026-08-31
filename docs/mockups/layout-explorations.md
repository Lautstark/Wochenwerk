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

## Recommendation

Build A first. It satisfies the central weekly-planner promise and makes unresolved choices easy to locate. The live prototype represents this direction; B and C are retained as explicit fallback directions, not as requirements.
