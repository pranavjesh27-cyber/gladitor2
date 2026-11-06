#!/usr/bin/env python3
"""
=============================================================
 Vaani — TERMINAL TEST SUITE (test the assistant WITHOUT a browser)
=============================================================
Usage (run from the voice-assistant folder):
    python test/test_cli.py doctor              # check keys + server + config
    python test/test_cli.py chat "Book an AC bus from Pune to Mumbai tomorrow 9pm, whatsapp 919876543210"
    python test/test_cli.py convo               # full simulated booking conversation
    python test/test_cli.py whisper my.wav      # test Groq Whisper transcription
    python test/test_cli.py whatsapp "Hello ticket" --send   # real WhatsApp message
"""
import json
import os
import pathlib
import sys

import requests

BASE = pathlib.Path(__file__).resolve().parent.parent
URL = os.getenv("VA_SERVER_URL", "http://localhost:8000").rstrip("/")

# same registry the demo site sends (subset for CLI testing)
REGISTRY = [
    {"name": "navigate", "description": "Open a page of the website",
     "params": {"page": "home/buses/trains/offers/checkout"}, "confirm": False},
    {"name": "searchBuses", "description": "Search available bus tickets",
     "params": {"from": "source city", "to": "destination city", "date": "YYYY-MM-DD",
                "time": "HH:MM", "ac": "true/false"}, "confirm": False},
    {"name": "searchTrains", "description": "Search available train tickets",
     "params": {"from": "source city", "to": "destination city", "date": "YYYY-MM-DD",
                "class": "2A/3A/SL/CC", "time": "HH:MM"}, "confirm": False},
    {"name": "bookTicket", "description": "Book the chosen ticket after user confirms",
     "params": {"mode": "bus/train", "from": "city", "to": "city", "date": "YYYY-MM-DD",
                "time": "HH:MM", "ac": "bool", "passengers": "int", "phone": "WhatsApp"},
     "confirm": True},
]
PAGES = {"home": "/", "buses": "/buses.html", "trains": "/trains.html",
         "checkout": "/checkout.html", "offers": "/offers.html"}


def chat_turn(messages, pending=None):
    r = requests.post(f"{URL}/api/chat", json={
        "messages": messages, "registry": REGISTRY, "pages": PAGES, "pending": pending,
    }, timeout=60)
    r.raise_for_status()
    return r.json()


def show(label, d):
    print(f"\n--- {label} ---")
    print(f"  reply     : {d.get('reply')}")
    print(f"  actions   : {json.dumps(d.get('actions'), ensure_ascii=False)}")
    print(f"  confirmed : {d.get('confirmed')}")
    print(f"  pending   : {json.dumps(d.get('pending'), ensure_ascii=False)}")
    print(f"  engine    : {d.get('engine')}")


def cmd_doctor():
    print("=== VAANI DOCTOR ===")
    env = {}
    p = BASE / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    key = env.get("GROQ_API_KEY", "")
    cbp, cbk = env.get("CALLMEBOT_PHONE", ""), env.get("CALLMEBOT_APIKEY", "")
    print(f"[{'✓' if key else '✗'}] GROQ_API_KEY        {'set (' + key[:6] + '…)' if key else 'MISSING → run: cp .env.example .env and paste your free key from console.groq.com/keys'}")
    print(f"[{'✓' if cbp else '✗'}] CALLMEBOT_PHONE     {'set' if cbp else 'missing → WhatsApp auto-send off (wa.me fallback still works)'}")
    print(f"[{'✓' if cbk else '✗'}] CALLMEBOT_APIKEY    {'set' if cbk else 'missing'}")
    try:
        h = requests.get(f"{URL}/health", timeout=5).json()
        print(f"[✓] server online at {URL}  engine={h['engine']}  model={h['model']}  whatsapp_ready={h['whatsapp_ready']}")
    except Exception as e:
        print(f"[✗] server NOT reachable at {URL} → start it:  cd {BASE} && uvicorn server:app --port 8000")
        print(f"    ({e.__class__.__name__})")
        return 1
    try:
        import fastapi, uvicorn, multipart  # noqa
        print("[✓] python deps installed (fastapi/uvicorn)")
    except ImportError:
        print("[✗] deps missing →  pip install -r requirements.txt")
        return 1
    print("\nDoctor done. Next:  python test/test_cli.py chat \"Book an AC bus from Pune to Mumbai tomorrow 9pm for 2, whatsapp 919876543210\"")
    return 0


def cmd_chat(text):
    d = chat_turn([{"role": "user", "content": text}])
    show("CHAT", d)
    return 0


def cmd_convo():
    print("=== FULL SIMULATED BOOKING CONVERSATION ===")
    msgs, pending = [], None

    msgs.append({"role": "user", "content": "Book an AC bus from Pune to Mumbai tomorrow at 9 pm for 2 passengers, my whatsapp is 919876543210"})
    d1 = chat_turn(msgs, pending)
    show("USER: " + msgs[-1]["content"], d1)
    msgs.append({"role": "assistant", "content": d1["reply"]})
    pending = d1.get("pending") or pending

    # pretend the widget executed the search action and fed the result back
    if d1.get("actions"):
        for a in d1["actions"]:
            msgs.append({"role": "user", "content": f"[TOOL RESULT] {a['name']}: Found 3 buses: 1) Neeta AC Sleeper 21:00 ₹1200 2) Sharma AC Seater 20:00 ₹1000 3) VRL AC Sleeper 22:30 ₹1400"})

    msgs.append({"role": "user", "content": "yes, confirm it"})
    d2 = chat_turn(msgs, pending)
    show("USER: " + msgs[-1]["content"], d2)

    ok = bool(d2.get("actions")) and d2.get("confirmed")
    print("\n--- WIDGET WOULD NOW ---")
    if ok:
        for a in d2["actions"]:
            print(f"  1. TravelAgent.run('{a['name']}', {json.dumps(a.get('args'))})")
        print("  2. POST /api/whatsapp {phone, ticket text}")
        print("  3. open wa.me link + CallMeBot auto-send")
    else:
        print("  (no confirmed booking yet — see replies above)")
    print("\nConvo test done." + ("" if ok else "\nNOTE: engine may be 'mock' — add GROQ_API_KEY for full intelligence."))
    return 0 if ok else 2


def cmd_whisper(path):
    if not path:
        print("usage: python test/test_cli.py whisper recording.wav"); return 1
    with open(path, "rb") as f:
        r = requests.post(f"{URL}/api/whisper",
                          files={"file": (os.path.basename(path), f, "audio/wav")}, timeout=90)
    print("transcript:", r.json() if r.ok else r.text)
    return 0


def cmd_whatsapp(message, send):
    if not send:
        print("DRY RUN (no message sent). Add --send to actually deliver to your WhatsApp.")
    r = requests.post(f"{URL}/api/whatsapp", json={
        "phone": os.getenv("VA_TEST_PHONE", "919876543210"), "message": message}, timeout=30)
    d = r.json()
    print(json.dumps(d, indent=2, ensure_ascii=False))
    if d.get("wa_link"):
        print("→ open this link to send manually (always works):", d["wa_link"])
    return 0


def main():
    cmds = sys.argv[1:]
    if not cmds or cmds[0] == "all":
        rc = cmd_doctor()
        if rc == 0:
            cmd_convo()
        return rc
    c = cmds[0]
    if c == "doctor": return cmd_doctor()
    if c == "chat": return cmd_chat(" ".join(cmds[1:]) or "I want to book a ticket")
    if c == "convo": return cmd_convo()
    if c == "whisper": return cmd_whisper(cmds[1] if len(cmds) > 1 else None)
    if c == "whatsapp": return cmd_whatsapp(" ".join(cmds[1:]) if len(cmds) > 1 else "Test from Vaani", "--send" in cmds)
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())
