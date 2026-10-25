"""
Restaurant reservation relay: Travel Planner <-> Gmail <-> Muse.

Runs every 10 minutes as a Cloud Run Job. Per run, for every trip that has not ended and
has `reservations_enabled` switched on in the app:

1. Read Muse's replies on that trip's [muse定位串] thread, have Gemini turn each
   into per-restaurant results, and write them onto the matching ideas as
   `idea.reservation`. The app listens on ideas, so results show up live.
2. If any restaurant / cafe / bar idea has never been sent, email one request
   listing every one that is still not booked, as a reply on the same thread.

Nothing is sent for a trip whose food ideas have all been requested already, so
an idle hour costs a Firestore read and a Gmail search, not an email.

Messages this job sends carry the X-Travel-Planner-Request header; that is how
a reply from Muse is told apart from our own request, since both may come from
the same mailbox.

Usage:
    py -3 main.py              # real run
    py -3 main.py --dry-run    # print what would be sent / written, change nothing
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

from google import genai
from google.cloud import firestore
from google.genai import types as gtypes
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", "travel-planner-cf0d4")
MAILBOX = os.environ.get("MAILBOX", "jj940170@gmail.com")
SUBJECT_TAG = "[muse定位串]"
REQ_HEADER = "X-Travel-Planner-Request"
FOOD = ("restaurant", "cafe", "bar")
STATUSES = ("booked", "available", "needs_card", "unavailable", "walk_in")
SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]
TOKEN_FILE = Path(__file__).parent / "token_muse.json"

# Used when an idea is not on the plan yet: the window Muse should look in.
FLEX_WINDOW = {
    "restaurant": "午餐 12:30–14:30 或晚餐 19:00–21:30",
    "cafe": "早上 08:00–11:00",
    "bar": "晚上 21:00–23:30",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ── Gmail ────────────────────────────────────────────────────────────────────
def gmail_service():
    """GMAIL_TOKEN (Secret Manager, on Cloud Run) or token_muse.json (local)."""
    raw = os.environ.get("GMAIL_TOKEN") or TOKEN_FILE.read_text(encoding="utf-8")
    creds = Credentials.from_authorized_user_info(json.loads(raw.lstrip(chr(0xFEFF))), SCOPES)
    if not creds.valid:
        creds.refresh(Request())
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def header(msg: dict, name: str) -> str:
    for h in msg.get("payload", {}).get("headers", []):
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def plain_text(payload: dict) -> str:
    """First text/plain part, falling back to tag-stripped text/html."""
    def walk(p):
        yield p
        for c in p.get("parts", []) or []:
            yield from walk(c)

    parts = list(walk(payload))
    for mime in ("text/plain", "text/html"):
        for p in parts:
            data = p.get("body", {}).get("data")
            if p.get("mimeType") == mime and data:
                text = base64.urlsafe_b64decode(data).decode("utf-8", "replace")
                return re.sub(r"<[^>]+>", " ", text) if mime == "text/html" else text
    return ""


def strip_quoted(text: str) -> str:
    """Drop the quoted request below a reply, so Gemini reads only Muse's part."""
    out = []
    for line in text.splitlines():
        if re.match(r"^On .+wrote:$", line.strip()) or re.match(r"^.+於.+寫道：?$", line.strip()):
            break
        if not line.lstrip().startswith(">"):
            out.append(line)
    return "\n".join(out).strip()


# ── Trip data ────────────────────────────────────────────────────────────────
def trip_key(trip_doc_id: str) -> str:
    """Short token in the subject so a reply on a fresh thread still finds its trip."""
    return f"TP-{trip_doc_id[:6]}"


def party_size(trip: dict) -> int:
    if trip.get("party_size"):
        return int(trip["party_size"])
    ids = {trip.get("owner_id"), *(trip.get("shared_with") or [])} - {None, ""}
    return max(len(ids), 1)


def _mins(hhmm: str) -> int | None:
    m = re.match(r"^(\d{1,2}):(\d{2})", hhmm or "")
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def _hhmm(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"


def free_windows(trip: dict, activities: list[dict]) -> dict[str, tuple[int, int] | None]:
    """
    When the travellers are actually in town, per trip day, in minutes.

    Derived from the flights: on a day in the first half of the trip the last
    flight is the arrival, and nothing can start until 90 minutes after it
    lands (immigration, bags, the ride in); in the second half the first
    flight is the departure, and everything must be over 3 hours before it
    leaves. Without this a slot like Pujol 11/28 14:00 came back as bookable
    on a day whose flight out was at 12:25. None means the whole day is gone.
    """
    start, end = date.fromisoformat(trip["start_date"]), date.fromisoformat(trip["end_date"])
    mid = start + (end - start) / 2
    out: dict[str, tuple[int, int] | None] = {}
    d = start
    while d <= end:
        ds = d.isoformat()
        flights = sorted((a for a in activities if a.get("is_flight") and a.get("date") == ds),
                         key=lambda a: a.get("start_time", ""))
        window: tuple[int, int] | None = (0, 24 * 60)
        if flights:
            if d <= mid:
                landed = _mins(flights[-1].get("end_time", ""))
                if landed is not None:
                    window = (landed + 90, 24 * 60) if landed + 90 < 24 * 60 else None
            else:
                leaves = _mins(flights[0].get("start_time", ""))
                if leaves is not None:
                    window = (0, leaves - 180) if leaves - 180 > 0 else None
        out[ds] = window
        d += timedelta(days=1)
    return out


def windows_text(windows: dict[str, tuple[int, int] | None]) -> str:
    lines = []
    for ds, w in windows.items():
        day = ds[5:].replace("-", "/")
        if w is None:
            lines.append(f"- {day}：不行（航班當天，整天都不在城裡）")
        elif w == (0, 24 * 60):
            lines.append(f"- {day}：全天")
        elif w[0] == 0:
            lines.append(f"- {day}：{_hhmm(w[1])} 前要結束（之後要去機場）")
        else:
            lines.append(f"- {day}：{_hhmm(w[0])} 之後（剛下飛機）")
    return "\n".join(lines)


def slot_fits(slot: str, windows: dict[str, tuple[int, int] | None], sitting: int = 90) -> bool:
    """A 'YYYY-MM-DD HH:MM' slot that starts and finishes inside that day's window."""
    m = re.match(r"^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})", slot.strip())
    if not m:
        return True  # unparseable: leave it for a person to read
    w = windows.get(m.group(1), (0, 24 * 60))
    t = _mins(m.group(2))
    return w is not None and t is not None and w[0] <= t and t + sitting <= w[1]


def windows_sig(windows: dict) -> str:
    return json.dumps(windows, sort_keys=True)


def desired_time(idea: dict, activities: list[dict], trip: dict) -> str:
    """
    Planned slot if the idea is on the plan and the travellers can make it,
    else a flexible window. A suggested-plan time can predate the flights —
    Day 1 assumed an afternoon arrival before the 22:30 landing was known.
    """
    title = idea.get("title", "")
    windows = free_windows(trip, activities)
    sitting = 120 if idea.get("category") == "bar" else 60 if idea.get("category") == "cafe" else 90
    fits = lambda ds, hm: slot_fits(f"{ds} {hm}", windows, sitting)
    for a in activities:
        if a.get("activity") == title and not a.get("is_flight") and fits(a["date"], a.get("start_time", "")):
            return f"{a['date'][5:].replace('-', '/')} {a.get('start_time', '')}（已排進行程）"
    for d in (trip.get("suggested_plan") or {}).get("days", []):
        for s in d.get("stops", []):
            if s.get("idea_title") == title and fits(d["date"], s.get("start_time", "")):
                return f"{d['date'][5:].replace('-', '/')} {s.get('start_time', '')}（建議行程）"
    return f"彈性：下面「可以的時間」內任一天 {FLEX_WINDOW.get(idea.get('category'), FLEX_WINDOW['restaurant'])}"


def build_request(trip: dict, trip_id: str, ideas: list[tuple[str, dict]], activities: list[dict]) -> tuple[str, str, dict]:
    refs = {}
    lines = []
    for n, (idea_id, idea) in enumerate(ideas, 1):
        refs[str(n)] = idea_id
        area = f"（{idea['area']}）" if idea.get("area") else ""
        lines.append(f"#{n} {idea['title']}{area} — 希望：{desired_time(idea, activities, trip)}")

    subject = f"{SUBJECT_TAG} {trip['name']} {trip_key(trip_id)}"
    body = f"""Muse 你好，

這是 Travel Planner 自動寄出的訂位請求。
旅程：{trip['name']}（{trip['country']}），{trip['start_date']} ~ {trip['end_date']}，{party_size(trip)} 人。

可以的時間（依航班算好的，只能訂在這些時間內，時間外的位子不要訂、也不要回報）：
{windows_text(free_windows(trip, activities))}

規則：
- 不需要綁信用卡、也不需要預付的：請直接用 Jay Huang 的名義訂下最符合的時段。
- 需要綁卡／預付，或只能打電話訂的：不要訂，回報旅程期間可以訂的時段。
- 不收訂位、只能現場排隊的：註明 WALK_IN。

這次請處理的店（目前全部還沒訂到）：
{chr(10).join(lines)}

請直接回覆這封信，每家一行，格式：
#編號 | 狀態 | 時間 | 備註

狀態只用這五種：
BOOKED       已訂好。時間填訂到的日期時間，備註填確認碼。
AVAILABLE    可以訂但沒訂（不在規則內或想先確認）。時間填可訂時段，多個用逗號分開。
NEEDS_CARD   要綁卡或預付所以沒訂。時間填可訂時段。
UNAVAILABLE  旅程期間都訂不到。
WALK_IN      不收訂位。

例：
#1 | BOOKED | 11/25 13:30 | 確認碼 ABC123
#2 | NEEDS_CARD | 11/26 19:00, 11/26 21:30 | Tock 要先付訂金

（{REQ_HEADER} 會由 Travel Planner 讀回來，請不要改標題裡的 {trip_key(trip_id)}。）
"""
    return subject, body, refs


# ── Reply parsing ────────────────────────────────────────────────────────────
def in_trip_year(slot: str, trip: dict) -> str:
    """
    Move a "YYYY-MM-DD HH:MM" slot to the year that puts it in (or nearest) the trip.

    Muse writes "11/25 19:00" with no year, and Gemini filled one in from its
    own sense of "now" — 2023 — which put three bookings on days that are not
    in the trip at all. Trying the trip's year and its neighbours also covers a
    trip across New Year, where December and January belong to different years.
    """
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})(.*)$", slot.strip())
    if not m:
        return slot
    start, end = date.fromisoformat(trip["start_date"]), date.fromisoformat(trip["end_date"])
    month, day, rest = int(m.group(2)), int(m.group(3)), m.group(4)

    def distance(c: date) -> int:
        return 0 if start <= c <= end else min(abs((c - start).days), abs((c - end).days))

    try:
        best = min((date(y, month, day) for y in (start.year - 1, start.year, start.year + 1)), key=distance)
    except ValueError:  # Feb 29 in a year without one
        return slot
    return best.isoformat() + rest


def parse_reply(text: str, refs: dict, ideas: dict[str, dict], trip: dict) -> list[dict]:
    listing = "\n".join(f"#{n} {ideas[i]['title']}" for n, i in refs.items() if i in ideas)
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"].lstrip(chr(0xFEFF)).strip())
    prompt = f"""以下是訂位助理 Muse 回覆的訂位結果。請把每家店的結果整理出來。

這次請求的店（編號 → 名稱）：
{listing}

規則：
- ref 填上面的編號數字；回覆只寫店名沒寫編號時，依名稱對到最接近的那一個。對不到就不要列。
- status 只能是 booked / available / needs_card / unavailable / walk_in。
- slots 是可訂或已訂的時段，每個寫成 "YYYY-MM-DD HH:MM"，沒有就空陣列。旅程是 {trip["start_date"]} 到 {trip["end_date"]}；回覆裡只寫月/日時，年份一律用落在這段期間的那一年。
- confirmation 是確認碼，沒有就空字串。
- note 用一句話保留其他重要資訊（訂金、人數限制、要電話訂之類），沒有就空字串。同一句話要給兩個版本：note 用繁體中文，note_en 用英文；店名、金額、email、電話照原文。

Muse 的回覆：
\"\"\"
{text[:8000]}
\"\"\""""
    res = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=gtypes.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "results": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "ref": {"type": "NUMBER"},
                                "status": {"type": "STRING"},
                                "slots": {"type": "ARRAY", "items": {"type": "STRING"}},
                                "confirmation": {"type": "STRING"},
                                "note": {"type": "STRING"},
                                "note_en": {"type": "STRING"},
                            },
                            "required": ["ref", "status"],
                        },
                    }
                },
                "required": ["results"],
            },
        ),
    )
    out = []
    for r in json.loads(res.text or "{}").get("results", []):
        idea_id = refs.get(str(int(r.get("ref", 0))))
        status = str(r.get("status", "")).lower()
        if idea_id and status in STATUSES:
            out.append({"idea_id": idea_id, "status": status,
                        "slots": [in_trip_year(str(x), trip) for x in (r.get("slots") or [])],
                        "confirmation": r.get("confirmation") or "", "note": r.get("note") or "",
                        "note_en": r.get("note_en") or ""})
    return out


# ── Per trip ─────────────────────────────────────────────────────────────────
def handle_trip(db, gmail, trip_ref, trip: dict, dry: bool) -> None:
    trip_id = trip_ref.id
    # Child rows point at the legacy `id` field when there is one.
    child_id = trip.get("id") or trip_id
    state = dict(trip.get("reservation_thread") or {})
    processed = set(state.get("processed") or [])

    idea_docs = list(db.collection("ideas").where("trip_id", "==", child_id).stream())
    food = {d.id: d.to_dict() for d in idea_docs if d.to_dict().get("category") in FOOD}
    if not food:
        return

    # 1. Replies. (A dry run before Gmail is authorized has no service.)
    q = f'subject:"{trip_key(trip_id)}" subject:"muse定位串"'
    msg_ids = [] if gmail is None else [
        m["id"] for m in gmail.users().messages().list(userId="me", q=q, maxResults=50).execute().get("messages", [])
    ]
    for mid in reversed(msg_ids):  # oldest first, so a later reply wins
        if mid in processed:
            continue
        msg = gmail.users().messages().get(userId="me", id=mid, format="full").execute()
        processed.add(mid)
        if header(msg, REQ_HEADER):
            continue
        text = strip_quoted(plain_text(msg["payload"]))
        if not text:
            continue
        results = parse_reply(text, state.get("refs") or {}, food, trip)
        print(f"  reply {mid}: {len(results)} results")
        for r in results:
            # Marked by hand in the app (booked it themselves, or gave up):
            # that decision outranks anything in a later reply.
            if (food[r["idea_id"]].get("reservation") or {}).get("manual"):
                continue
            res = {
                **(food[r["idea_id"]].get("reservation") or {}),
                "status": r["status"], "slots": r["slots"], "confirmation": r["confirmation"],
                "note": r["note"], "note_en": r["note_en"], "updated_at": now_iso(),
            }
            print(f"    {food[r['idea_id']]['title']}: {r['status']} {r['slots']} {r['confirmation']}")
            if not dry:
                db.collection("ideas").document(r["idea_id"]).update({"reservation": res})
            food[r["idea_id"]]["reservation"] = res
        state["last_reply_at"] = now_iso()

    # 2. Drop reported times the travellers cannot make, given their flights.
    acts = [a.to_dict() for a in db.collection("activities").where("trip_id", "==", child_id).stream()]
    windows = free_windows(trip, acts)
    manual = {i for i, d in food.items() if (d.get("reservation") or {}).get("manual")}
    for i, d in food.items():
        r = d.get("reservation") or {}
        if i in manual or r.get("status") not in ("available", "needs_card") or not r.get("slots"):
            continue
        sitting = 120 if d.get("category") == "bar" else 60 if d.get("category") == "cafe" else 90
        keep = [x for x in r["slots"] if slot_fits(x, windows, sitting)]
        if keep == r["slots"]:
            continue
        res = {**r, "slots": keep}
        if not keep:
            # Nothing reported is reachable: ask again within the right times
            # rather than call it unavailable on the strength of bad windows.
            res.update(status="requested",
                       note="先前回報的時段都跟航班時間衝突，已請 Muse 在可行時段重新查詢。",
                       note_en="All reported times clashed with the flights; Muse has been asked again for times that work.")
        print(f"  {d['title']}: dropped {len(r['slots']) - len(keep)} slot(s) outside the travel windows")
        if not dry:
            db.collection("ideas").document(i).update({"reservation": res})
        d["reservation"] = res

    # 3. New request when something has never been sent, or the windows moved
    # (a flight was added or changed) since the last request.
    never_sent = [i for i, d in food.items() if i not in manual and not (d.get("reservation") or {}).get("requested_at")]
    sig = windows_sig(windows)
    if state.get("windows_sig") is None and state.get("last_request_at"):
        # First run since windows existed: the earlier request told Muse
        # nothing about flights, which only matters if any day is restricted.
        restricted = any(w != (0, 24 * 60) for w in windows.values())
        moved = restricted
        if not restricted:
            state["windows_sig"] = sig
    else:
        moved = bool(state.get("last_request_at")) and state.get("windows_sig") != sig
    if never_sent or moved:
        open_ideas = sorted(
            # Booked is done and walk-in cannot be booked: neither is worth asking about again.
            ((i, d) for i, d in food.items()
             if i not in manual and (d.get("reservation") or {}).get("status") not in ("booked", "walk_in")),
            key=lambda x: x[1].get("created_at", ""),
        )
        subject, body, refs = build_request(trip, trip_id, open_ideas, acts)
        print(f"  sending request: {len(open_ideas)} places ({len(never_sent)} new)")
        if dry:
            print(subject)
            print(body)
        else:
            em = EmailMessage()
            em["To"] = MAILBOX
            em["From"] = MAILBOX
            em["Subject"] = subject
            em[REQ_HEADER] = trip_id
            if state.get("last_message_id"):
                em["In-Reply-To"] = state["last_message_id"]
                em["References"] = state["last_message_id"]
            em.set_content(body)
            payload = {"raw": base64.urlsafe_b64encode(em.as_bytes()).decode()}
            if state.get("thread_id"):
                payload["threadId"] = state["thread_id"]
            sent = gmail.users().messages().send(userId="me", body=payload).execute()
            full = gmail.users().messages().get(userId="me", id=sent["id"], format="metadata",
                                                metadataHeaders=["Message-ID"]).execute()
            processed.add(sent["id"])
            state.update(thread_id=sent["threadId"], last_message_id=header(full, "Message-ID"),
                         last_request_at=now_iso(), refs=refs, windows_sig=windows_sig(windows))
            stamp = now_iso()
            for i, d in open_ideas:
                prev = d.get("reservation") or {}
                db.collection("ideas").document(i).update({"reservation": {
                    **prev, "status": prev.get("status") or "requested", "requested_at": stamp,
                }})

    state["processed"] = sorted(processed)[-200:]
    if not dry and state != (trip.get("reservation_thread") or {}):
        trip_ref.update({"reservation_thread": state})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    db = firestore.Client(project=FIRESTORE_PROJECT)
    has_token = bool(os.environ.get("GMAIL_TOKEN")) or TOKEN_FILE.exists()
    gmail = gmail_service() if has_token or not args.dry_run else None
    today = date.today().isoformat()
    for ref in db.collection("trips").stream():
        trip = ref.to_dict()
        if not trip.get("reservations_enabled"):
            continue
        if not trip.get("end_date") or trip["end_date"] < today:
            continue
        print(f"trip {trip.get('name')} ({ref.id})")
        try:
            handle_trip(db, gmail, ref.reference, trip, args.dry_run)
        except Exception as e:  # one broken trip must not stop the others
            print(f"  ERROR: {e!r}")


if __name__ == "__main__":
    main()
