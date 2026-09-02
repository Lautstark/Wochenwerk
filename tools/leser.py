"""Die Brücke: was im Schlitz liegt, als Strom von Ereignissen.

Sie kennt keine Termine, speichert nichts und beantwortet keine Fragen. Sie sagt
zwei Dinge — welche Karte aufliegt und dass keine mehr aufliegt — und ist damit ein
Gerätetreiber und kein Server.

Gegen PC/SC selbst, über das PCSC-Framework, das macOS mitbringt; kein Paket, kein
Build. `SCardGetStatusChange` wartet, bis sich etwas ändert, also kostet Warten
nichts und die Meldung kommt in dem Moment, in dem die Karte aufliegt oder weg ist.
Die UID holt die Pseudo-APDU FF CA 00 00 00, die der PN532 im ACR122U beantwortet,
ohne dass die Karte irgendein Dateisystem haben müsste.

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

pcsc = ctypes.CDLL("/System/Library/Frameworks/PCSC.framework/PCSC")

# Apple typedef'd LONG/ULONG als int32/uint32 — nicht wie pcsc-lite auf Linux.
DWORD = ctypes.c_uint32
SCARDCONTEXT, SCARDHANDLE = ctypes.c_int32, ctypes.c_int32

SCARD_SCOPE_SYSTEM = 2
SCARD_SHARE_SHARED = 2
SCARD_PROTOCOL_T0, SCARD_PROTOCOL_T1 = 1, 2
SCARD_LEAVE_CARD = 0
SCARD_STATE_UNAWARE, SCARD_STATE_PRESENT = 0x0000, 0x0020
TIMEOUT = 0x8010000A


class READERSTATE(ctypes.Structure):
    _fields_ = [
        ("szReader", ctypes.c_char_p),
        ("pvUserData", ctypes.c_void_p),
        ("dwCurrentState", DWORD),
        ("dwEventState", DWORD),
        ("cbAtr", DWORD),
        ("rgbAtr", ctypes.c_ubyte * 33),
    ]


class IO_REQUEST(ctypes.Structure):
    _fields_ = [("dwProtocol", DWORD), ("cbPciLength", DWORD)]


# ctypes gibt die Rückgabewerte vorzeichenbehaftet zurück; PC/SC-Codes sind es nicht.
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


def poll(slot):
    context = SCARDCONTEXT(0)
    check("SCardEstablishContext",
          pcsc.SCardEstablishContext(SCARD_SCOPE_SYSTEM, None, None, ctypes.byref(context)))
    found = readers(context)
    if not found:
        print("kein Leser", flush=True)
        return
    reader = found[0]
    print(f"Leser: {reader.decode()}", flush=True)

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


def main(port=8765):
    slot = Slot()
    Bridge.slot = slot
    threading.Thread(target=poll, args=(slot,), daemon=True).start()
    print(f"Brücke auf http://localhost:{port}/leser", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Bridge).serve_forever()


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 8765)
