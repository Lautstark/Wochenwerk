"""Die Brücke: was im Schlitz liegt, als Strom von Ereignissen.

Sie kennt keine Termine, speichert nichts und beantwortet keine Fragen. Sie sagt
zwei Dinge — welche Karte aufliegt und dass keine mehr aufliegt — und ist damit ein
Gerätetreiber und kein Server.

Gegen PC/SC selbst, ohne Paket und ohne Build — aber „ohne Paket" heißt auf den
beiden Maschinen etwas Verschiedenes. macOS bringt PC/SC im System mit, da ist
wirklich nichts zu tun. Linux nicht: dort ist PC/SC der Dienst `pcscd` mit dem
CCID-Treiber, und der muss installiert sein und laufen. Was hier fehlt, ist nur das
Python-Drumherum; die Hälfte, die den Leser anfasst, ist auf dem Wandgerät eine
Installation. Siehe docs/wyse-einrichten.md.

`SCardGetStatusChange` wartet, bis sich etwas ändert, also kostet Warten nichts und
die Meldung kommt in dem Moment, in dem die Karte aufliegt oder weg ist. Die UID
holt die Pseudo-APDU FF CA 00 00 00, die der PN532 im ACR122U beantwortet, ohne dass
die Karte irgendein Dateisystem haben müsste.

    python3 leser.py [port]

Der Strom liegt auf /leser und schickt Zeilen wie {"uid": "04633e…"} und
{"uid": null}. Wer sich verbindet, bekommt sofort den aktuellen Stand — ein Board,
das neu lädt, während eine Karte im Schlitz liegt, weiß damit gleich Bescheid.
"""
import ctypes
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Dieselbe Schnittstelle, zwei Rechenbreiten. PC/SC stammt von Windows, und beide
# Portierungen haben `LONG` so übersetzt, wie es auf ihrer Plattform naheliegend war:
# Apple hat es in `wintypes.h` auf `int32_t` festgenagelt, pcsc-lite nimmt das C-`long`
# — und das ist unter Linux auf x86_64 64 Bit breit. Daran hängt nicht nur der
# Rückgabewert, sondern über `DWORD` auch `SCARDCONTEXT`, `SCARDHANDLE` und die Lage
# jedes einzelnen Feldes in READERSTATE. Die falsche Breite ist deshalb kein Fehler,
# den man sieht: die Aufrufe gelingen weiter und liefern Müll.
#
# Also eine Datei und zwei Breiten, entschieden beim Laden. Zwei Dateien wären der
# andere Weg, und der falsche: geteilt ist hier alles außer sechs Zeilen, und was der
# Haushalt am Mac plant, soll derselbe Leser sein wie der an der Wand.
if sys.platform == "darwin":
    pcsc = ctypes.CDLL("/System/Library/Frameworks/PCSC.framework/PCSC")
    LONG, ULONG = ctypes.c_int32, ctypes.c_uint32
else:
    pcsc = ctypes.CDLL("libpcsclite.so.1")
    LONG, ULONG = ctypes.c_long, ctypes.c_ulong

DWORD = ULONG
SCARDCONTEXT = SCARDHANDLE = LONG

SCARD_SCOPE_SYSTEM = 2
SCARD_SHARE_SHARED = 2
SCARD_PROTOCOL_T0, SCARD_PROTOCOL_T1 = 1, 2
SCARD_LEAVE_CARD = 0
SCARD_STATE_UNAWARE, SCARD_STATE_PRESENT = 0x0000, 0x0020
TIMEOUT = 0x8010000A
MAX_ATR_SIZE = 33


# `#pragma pack(1)` steht in pcsclite.h über beiden Strukturen, auf beiden Plattformen
# — also byteweise gepackt und nicht so, wie ctypes von sich aus ausrichten würde. Die
# Feldpositionen kämen hier zufällig auch ohne das hin, weil jedes Feld schon auf
# seiner natürlichen Grenze liegt; die Größe nicht, und an der hängt der Abstand
# zwischen zwei READERSTATE in einem Feld. Wir fragen heute nur einen Leser ab, aber
# ein zweiter wäre eine Zeile — und dann wäre es ein Fehler, der aussieht wie Pech.
#
# `_layout_` steht dabei ausgeschrieben, weil ctypes sonst warnt und ab Python 3.19
# abbricht: es will wissen, nach wessen Regeln „gepackt" gemeint ist. Und es kennt
# `_pack_` nur unter `"ms"` — `"gcc-sysv"`, was den Headern eigentlich entspräche,
# lehnt es zusammen mit `_pack_` rundheraus ab. Das ist hier kein Kompromiss: bei
# Packung 1 bleibt in der Struktur keine einzige Lücke übrig, über die die beiden
# Modelle verschiedener Meinung sein könnten. Sie unterscheiden sich erst weiter oben,
# bei Bitfeldern und gröberen Packungen, und beides kommt hier nicht vor.
# Ältere Pythons kennen `_layout_` gar nicht und übergehen es; auch richtig.
LAYOUT = "ms"


class READERSTATE(ctypes.Structure):
    _pack_ = 1
    _layout_ = LAYOUT
    _fields_ = [
        ("szReader", ctypes.c_char_p),
        ("pvUserData", ctypes.c_void_p),
        ("dwCurrentState", DWORD),
        ("dwEventState", DWORD),
        ("cbAtr", DWORD),
        ("rgbAtr", ctypes.c_ubyte * MAX_ATR_SIZE),
    ]


class IO_REQUEST(ctypes.Structure):
    _pack_ = 1
    _layout_ = LAYOUT
    _fields_ = [("dwProtocol", DWORD), ("cbPciLength", DWORD)]


# Die Signaturen ausgeschrieben, statt sie ctypes raten zu lassen — denn ctypes rät
# 32 Bit. Ohne `restype` liest es jeden Rückgabewert als `int`, ohne `argtypes` schiebt
# es jede Python-Zahl als `int` in ein Register, in dem unter Linux ein 64 Bit breites
# `DWORD` erwartet wird. Auf macOS ist beides zufällig richtig, und genau deshalb steht
# es hier: was nur auf einer der beiden Maschinen stimmt, muss hingeschrieben werden.
BYTES = ctypes.POINTER(ctypes.c_ubyte)
for name, args in {
    "SCardEstablishContext": [DWORD, ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(SCARDCONTEXT)],
    "SCardListReaders": [SCARDCONTEXT, ctypes.c_char_p, ctypes.c_char_p, ctypes.POINTER(DWORD)],
    "SCardConnect": [SCARDCONTEXT, ctypes.c_char_p, DWORD, DWORD, ctypes.POINTER(SCARDHANDLE), ctypes.POINTER(DWORD)],
    "SCardTransmit": [SCARDHANDLE, ctypes.POINTER(IO_REQUEST), BYTES, DWORD, ctypes.POINTER(IO_REQUEST), BYTES, ctypes.POINTER(DWORD)],
    "SCardDisconnect": [SCARDHANDLE, DWORD],
    "SCardGetStatusChange": [SCARDCONTEXT, DWORD, ctypes.POINTER(READERSTATE), DWORD],
}.items():
    function = getattr(pcsc, name)
    function.argtypes, function.restype = args, LONG


# PC/SC-Codes sind vorzeichenlose 32-Bit-Zahlen, kommen aber verschieden hier an: als
# negatives `int32` auf macOS, als positives `long` unter Linux, wo dieselben Bits in
# 64 Bit passen. Beide Male sind es dieselben unteren 32 Bit, und die sind gemeint.
def rc(code):
    return code & 0xFFFFFFFF


def check(name, code):
    if rc(code) != 0:
        raise OSError(f"{name}: 0x{rc(code):08x}")


def readers(context):
    length = DWORD(0)
    check("SCardListReaders", pcsc.SCardListReaders(context, None, None, ctypes.byref(length)))
    buffer = ctypes.create_string_buffer(length.value)
    check("SCardListReaders", pcsc.SCardListReaders(context, None, buffer, ctypes.byref(length)))
    return [name for name in buffer.raw.split(b"\0") if name]


def uid_of(context, reader):
    """Die UID der Karte, die gerade aufliegt — oder None, wenn sie nicht antwortet."""
    card, protocol = SCARDHANDLE(0), DWORD(0)
    if rc(pcsc.SCardConnect(context, reader, SCARD_SHARE_SHARED,
                            SCARD_PROTOCOL_T0 | SCARD_PROTOCOL_T1,
                            ctypes.byref(card), ctypes.byref(protocol))) != 0:
        return None
    try:
        send = (ctypes.c_ubyte * 5)(0xFF, 0xCA, 0x00, 0x00, 0x00)
        recv = (ctypes.c_ubyte * 258)()
        received = DWORD(258)
        pci = IO_REQUEST.in_dll(pcsc, "g_rgSCardT1Pci" if protocol.value == SCARD_PROTOCOL_T1 else "g_rgSCardT0Pci")
        if rc(pcsc.SCardTransmit(card, ctypes.byref(pci), send, 5, None, recv, ctypes.byref(received))) != 0:
            return None
        answer = bytes(recv[:received.value])
        if len(answer) < 3 or answer[-2:] != b"\x90\x00":
            return None
        return answer[:-2].hex()
    finally:
        pcsc.SCardDisconnect(card, SCARD_LEAVE_CARD)


class Slot:
    """Was im Schlitz liegt, und wer davon erfahren will.

    Entprellt wird hier und nirgends sonst: ein verpasster Lesevorgang darf am Board
    nicht als Entnahme ankommen, also gilt eine Karte erst als weg, wenn sie es
    einen Moment lang bleibt.
    """

    settle = 0.4

    def __init__(self):
        self.lock = threading.Lock()
        self.uid = None
        self.listeners = []

    def watch(self):
        stream, ready = [], threading.Event()
        with self.lock:
            self.listeners.append((stream, ready))
            stream.append(self.uid)
            ready.set()
        return stream, ready

    def unwatch(self, stream):
        with self.lock:
            self.listeners = [item for item in self.listeners if item[0] is not stream]

    def holds(self, uid):
        with self.lock:
            if uid == self.uid:
                return
            self.uid = uid
            for stream, ready in self.listeners:
                stream.append(uid)
                ready.set()
        print(f"IN {uid}" if uid else "OUT", flush=True)


def attach():
    """Kontext und Leser — oder gar nichts, und zwar sofort."""
    context = SCARDCONTEXT(0)
    check("SCardEstablishContext",
          pcsc.SCardEstablishContext(SCARD_SCOPE_SYSTEM, None, None, ctypes.byref(context)))
    found = readers(context)
    if not found:
        raise OSError("kein Leser")
    return context, found[0]


def poll(slot, context, reader):
    state = (READERSTATE * 1)()
    state[0].szReader = reader
    state[0].dwCurrentState = SCARD_STATE_UNAWARE
    empty_since = None
    while True:
        code = rc(pcsc.SCardGetStatusChange(context, 300, state, 1))
        if code not in (0, TIMEOUT):
            check("SCardGetStatusChange", code)
        state[0].dwCurrentState = state[0].dwEventState
        if state[0].dwEventState & SCARD_STATE_PRESENT:
            empty_since = None
            if slot.uid is None:
                slot.holds(uid_of(context, reader) or "?")
        else:
            empty_since = empty_since or time.time()
            if slot.uid is not None and time.time() - empty_since >= Slot.settle:
                slot.holds(None)


class Bridge(BaseHTTPRequestHandler):
    slot = None

    def do_GET(self):
        if self.path != "/leser":
            return self.send_error(404)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        stream, ready = self.slot.watch()
        try:
            while True:
                if ready.wait(15):
                    ready.clear()
                    while stream:
                        self.wfile.write(f"data: {json.dumps({'uid': stream.pop(0)})}\n\n".encode())
                else:
                    self.wfile.write(b": ping\n\n")   # damit ein toter Strom auffaellt
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            self.slot.unwatch(stream)

    def log_message(self, *args):
        pass


def watch(slot, context, reader, server):
    """Der Leser — und was es heißt, wenn er aufhört.

    Endet die Beobachtung, aus welchem Grund auch immer — kein Leser angeschlossen,
    `pcscd` nicht erreichbar, das Gerät im Betrieb abgezogen —, dann endet die Brücke
    mit ihr. Das ist keine Härte, sondern die einzige Art, dem Board „Leser antwortet
    nicht" zu sagen: es liest genau das am Abriss des Stroms ab (src/reader.ts,
    src/main.ts). Eine Brücke, die stattdessen weiterliefe und dabei „keine Karte"
    meldete, behauptete das Gegenteil von dem, was los ist — und das ist die eine
    Verwechslung, die docs/hardware.md ausdrücklich ausschließt, weil an ihrem Ende
    jede gegebene Antwort auf einmal zurückgenommen wäre.

    Neu gestartet wird nicht hier, sondern draußen, von der Sitzung, die sie gestartet
    hat (~/.xinitrc auf dem Wandgerät). Steckt der Leser wieder, ist der Strom ein paar
    Sekunden später zurück, und das Board merkt es von selbst: `EventSource` verbindet
    sich ohne Zutun neu.
    """
    try:
        poll(slot, context, reader)
    except OSError as error:
        print(error, flush=True)
    finally:
        # Von außerhalb, sonst legt sich `shutdown` mit `serve_forever` schlafen.
        threading.Thread(target=server.shutdown, daemon=True).start()


def main(port=8765):
    # Erst den Leser suchen, dann den Port öffnen — in dieser Reihenfolge, und sie ist
    # der ganze Unterschied zwischen zwei Meldungen, die das Board auseinanderhält: eine
    # Brücke, die es nie gab, ist ein Aufbau ohne Leser und keine Störung; eine, die
    # einmal geantwortet hat und dann weg ist, ist eine (src/reader.ts). Das hängt
    # daran, dass eine Brücke ohne Leser gar nicht erst antwortet. Bände sie zuerst den
    # Port und ginge dann, stünde sie beim Neuversuch alle fünf Sekunden kurz Rede — und
    # an der Wand blinkte im selben Takt „Leser antwortet nicht" auf und wieder weg.
    context, reader = attach()
    print(f"Leser: {reader.decode()}", flush=True)
    slot = Slot()
    Bridge.slot = slot
    server = ThreadingHTTPServer(("127.0.0.1", port), Bridge)
    threading.Thread(target=watch, args=(slot, context, reader, server), daemon=True).start()
    print(f"Brücke auf http://localhost:{port}/leser", flush=True)
    server.serve_forever()
    raise SystemExit(1)


if __name__ == "__main__":
    try:
        main(int(sys.argv[1]) if len(sys.argv) > 1 else 8765)
    except OSError as error:
        print(error, flush=True)
        raise SystemExit(1)
