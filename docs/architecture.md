# Minimal architecture

## Now: prototype only

One browser UI with mock appointments. The clock is real — weekday, dates and the now state come from the system time and the board redraws each minute — so the prototype can be left running on a monitor for a day. It intentionally has no NFC, server, persistence, or authentication.

## After UI validation

```text
Phone browser ─┐                 ┌─ SQLite volume
               ├─ NAS web app ──┤
Board Chromium ┘       + SSE     └─ canonical household data
                              ▲
Wyse NFC bridge (PC/SC) ────────┘
```

Use one containerised app on the NAS and SQLite. Parent and board are routes in the same app. Server-Sent Events broadcast small change events after writes; the NFC bridge makes idempotent HTTP reports. This avoids microservices, WebSocket complexity, and client-canonical data.

The Wyse runs Chromium kiosk plus a tiny supervised PC/SC process. It contains no planning logic. ACS documents the ACR122U as PC/SC/CCID compatible with a Linux driver and a tag-dependent read range of up to 50 mm; Dell documents the Celeron J4105 / 4 GB / 16 GB Wyse configuration. That is viable for Chromium plus a bridge, but does not prove slot reliability. Sources: [ACS API](https://downloads.acs.com.hk/drivers/en/API-ACR122U-2.03.pdf), [ACS Linux driver](https://www.acs.com.hk/en/driver/3/acr1251-usb-nfc-reader/), [Dell platform guide](https://www.dell.com/support/manuals/en-us/wyse-5070-thin-client/tl_2.2_ag/supported-platform?guid=guid-13081229-a9f9-49cc-b5fb-c40ed31d08c0&lang=en-us).

Before enclosure work, run 100 insert/remove cycles per chosen card/tag. Require the same UID on two polls for insertion; regard absence lasting 750 ms as removal. Add an optical/mechanical slot sensor only if this test shows persistent ambiguity.
