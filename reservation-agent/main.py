"""
Restaurant reservation relay: Travel Planner <-> Gmail <-> Muse.

Runs every 10 minutes as a Cloud Run Job. Per run, for every trip that has not ended and
has `reservations_enabled` switched on in the app:

1. Read Muse's replies on that trip's [muse定位串] thread, have Gemini turn each
   into per-restaurant results, and write them onto the matching ideas as
   `idea.reservation`. The app listens on ideas, so results show up live.
2. If any restaurant / cafe / bar idea has never been sent, email one request
   listing every one that is still not booked, as a reply on the same thread.

Before the trips, once per run: hotel confirmation / change / cancellation
emails in the same mailbox become `accommodations` on whichever of Jay's trips
their dates fall in (see import_hotels); and [muse更新] emails — places Jay
sent Muse over WhatsApp, with what Muse found about booking them — become
stash ideas on the trip they belong to (see import_muse_updates); and every
place on a trip's linked Google Maps list that the stash has not seen becomes
an idea (see import_maps_lists), which step 2 then sends to Muse.

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
import html
import json
import os
import re
import unicodedata
import urllib.request
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote, unquote

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


def handled(idea: dict) -> bool:
    """Places Muse works on: every restaurant, café and bar, plus any sight
    flagged `needs_ticket` (timed entry, a balloon flight) in the app."""
    return idea.get("category") in FOOD or bool(idea.get("needs_ticket"))
STATUSES = ("booked", "available", "needs_card", "unavailable", "walk_in")
SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]
TOKEN_FILE = Path(__file__).parent / "token_muse.json"

SPARE = "（備選：只回報可訂時段，先不要訂）"

# Used when an idea is not on the plan yet: the window Muse should look in.
FLEX_WINDOW = {
    "restaurant": "午餐 12:30–14:30 或晚餐 19:00–21:30",
    "cafe": "早上 08:00–11:00",
    "bar": "晚上 21:00–23:30",
    "landmark": "白天 09:00–17:00 任一入場時段",
}

# English and local names for the same city, so an idea's "Seville" finds a
# hotel in "Sevilla". Only the pairs that do not share a prefix need listing.
CITY_ALIASES = [
    {"seville", "sevilla"}, {"lisbon", "lisboa"}, {"porto", "oporto"}, {"munich", "münchen"},
    {"florence", "firenze"}, {"rome", "roma"}, {"venice", "venezia"}, {"milan", "milano"},
    {"naples", "napoli"}, {"prague", "praha"}, {"vienna", "wien"}, {"cologne", "köln"},
    {"mexico city", "ciudad de méxico", "cdmx"}, {"tokyo", "東京"}, {"kyoto", "京都"}, {"osaka", "大阪"},
]


def city_names(area: str) -> set[str]:
    """Lower-case names an idea's area may appear as in a hotel address."""
    parts = {p.strip().lower() for p in re.split(r"[,，/、（）()]", area or "") if len(p.strip()) >= 3}
    for p in list(parts):
        for group in CITY_ALIASES:
            if p in group:
                parts |= group
    return parts


def city_days(accs: list[dict]) -> dict[str, list[tuple[str, bool]]]:
    """
    Per date: (hotel name + address, whole day?) for every stay that covers it.

    A check-out day only counts as a morning there — the travellers leave
    for the next city. Eslava in Sevilla was booked for dinner on the day
    they check out and move on to Granada.
    """
    out: dict[str, list[tuple[str, bool]]] = {}
    for a in accs:
        try:
            ci, co = date.fromisoformat(a["check_in"]), date.fromisoformat(a["check_out"])
        except (KeyError, ValueError):
            continue
        text = f"{a.get('name', '')} {a.get('address', '')}".lower()
        d = ci
        while d <= co:
            out.setdefault(d.isoformat(), []).append((text, d < co))
            d += timedelta(days=1)
    return out


def hotel_city(area: str, days: dict[str, list[tuple[str, bool]]]) -> set[str]:
    """
    The area's names, but only if one of the trip's hotels is in that city.

    An area is often a neighbourhood ("Roma Norte") or a day trip
    ("Teotihuacán") that no hotel address mentions; reading that as "not in
    town" asked Muse to move three good Mexico City bookings. Only a city the
    hotels name can be said to be somewhere the travellers are not.
    """
    names = city_names(area)
    return names if any(n in text for stays in days.values() for text, _ in stays for n in names) else set()


def slot_in_city(area: str, slot: str, days: dict[str, list[tuple[str, bool]]]) -> bool:
    """False only when the hotels say the travellers are somewhere else then."""
    m = re.match(r"^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})", slot.strip())
    names = hotel_city(area, days)
    if not m or not names or m.group(1) not in days:
        return True
    t = _mins(m.group(2)) or 0
    return any(any(n in text for n in names) and (whole or t < 11 * 60) for text, whole in days[m.group(1)])


def days_in(area: str, days: dict[str, list[tuple[str, bool]]]) -> list[str]:
    names = city_names(area)
    return sorted(d for d, stays in days.items() if any(whole and any(n in text for n in names) for text, whole in stays))


def stays_text(trip: dict, accs: list[dict], plan: list[dict]) -> str:
    """Where the travellers sleep each night, plus the city plan for nights with no hotel yet."""
    lines = [f"- {a['check_in'][5:].replace('-', '/')}–{a['check_out'][5:].replace('-', '/')} {a.get('name', '')}（{a.get('address') or '地址未填'}）"
             for a in sorted(accs, key=lambda a: a.get("check_in", ""))]
    covered = {d for d, s in city_days(accs).items() if any(w for _, w in s)}
    start, end = date.fromisoformat(trip["start_date"]), date.fromisoformat(trip["end_date"])
    gaps = [(start + timedelta(days=n)).isoformat() for n in range((end - start).days)]
    gaps = [d for d in gaps if d not in covered]
    if gaps:
        # Only the planned stays ("12/26–12/28 Granada") that cover a night with
        # no hotel: elsewhere the hotels are the truth and the old plan may disagree.
        def covers_gap(title: str) -> bool:
            m = re.match(r"^(\d{1,2})/(\d{1,2})\s*[–-]\s*(\d{1,2})/(\d{1,2})", title)
            if not m:
                return False
            lo, hi = in_trip_year(f"{start.year}-{int(m[1]):02d}-{int(m[2]):02d}", trip), in_trip_year(f"{start.year}-{int(m[3]):02d}-{int(m[4]):02d}", trip)
            return any(lo <= g < hi for g in gaps)
        hint = [p["title"] for p in plan if covers_gap(p.get("title", ""))]
        lines.append(f"- 還沒訂房的晚上：{'、'.join(g[5:].replace('-', '/') for g in gaps)}"
                     + (f"（原本規劃：{'、'.join(hint)}）" if hint else ""))
    return "\n".join(lines)


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
                return html_to_text(text) if mime == "text/html" else text
    return ""


def html_to_text(text: str) -> str:
    """Hotel mails are HTML-only, with ~18 KB of <style> before the first date."""
    text = re.sub(r"(?is)<(style|script|head)\b.*?</\1>|<!--.*?-->", " ", text)
    text = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|td|li|h\d)>", "\n", text)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    return re.sub(r"[ \t\r\xa0]*\n[\s\xa0]*", "\n", re.sub(r"[ \t\xa0]+", " ", text)).strip()


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
                # Landing "before" take-off is an overnight flight landing tomorrow.
                overnight = landed is not None and landed < (_mins(flights[-1].get("start_time", "")) or 0)
                if landed is not None:
                    window = (landed + 90, 24 * 60) if not overnight and landed + 90 < 24 * 60 else None
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


def desired_time(idea: dict, activities: list[dict], trip: dict, days: dict) -> str:
    """
    Planned slot if the idea is on the plan and the travellers can make it,
    else a flexible window on the days they are in that city. A suggested-plan
    time can predate the flights — Day 1 assumed an afternoon arrival before
    the 22:30 landing was known — and an unplaced idea used to be left to any
    day of the trip, which put a Madrid lunch on a day spent in Porto.
    """
    title = idea.get("title", "")
    windows = free_windows(trip, activities)
    sitting = 120 if idea.get("category") == "bar" else 60 if idea.get("category") == "cafe" else 90
    fits = lambda ds, hm: (slot_fits(f"{ds} {hm}", windows, sitting)
                           and slot_in_city(idea.get("area", ""), f"{ds} {hm}", days))
    for a in activities:
        if a.get("activity") == title and not a.get("is_flight") and fits(a["date"], a.get("start_time", "")):
            return f"{a['date'][5:].replace('-', '/')} {a.get('start_time', '')}（已排進行程）"
    for d in (trip.get("suggested_plan") or {}).get("days", []):
        for s in d.get("stops", []):
            if s.get("idea_title") == title and fits(d["date"], s.get("start_time", "")):
                return f"{d['date'][5:].replace('-', '/')} {s.get('start_time', '')}（建議行程）"
    window = FLEX_WINDOW.get(idea.get("category"), FLEX_WINDOW["landmark"] if idea.get("needs_ticket") else FLEX_WINDOW["restaurant"])
    # With a day-by-day plan, a place left off it is a fallback. Booking every
    # one outright filled the same Madrid lunch three times over.
    spare = SPARE if trip.get("suggested_plan") else ""
    area = idea.get("area", "")
    there = days_in(area, days) if hotel_city(area, days) else []
    if there:
        return f"彈性：在 {area} 的日子（{'、'.join(d[5:].replace('-', '/') for d in there)}）{window}{spare}"
    return f"彈性：下面「可以的時間」內任一天 {window}{spare}"


def build_request(trip: dict, trip_id: str, ideas: list[tuple[str, dict]], activities: list[dict],
                  resize: tuple[int, int] | None = None, accs: list[dict] | None = None,
                  plan: list[dict] | None = None, moves: set[str] | None = None) -> tuple[str, str, dict]:
    refs = {}
    lines = []
    accs, moves = accs or [], moves or set()
    days = city_days(accs)
    for n, (idea_id, idea) in enumerate(ideas, 1):
        refs[str(n)] = idea_id
        area = f"（{idea['area']}）" if idea.get("area") else ""
        kind = "（門票／預約）" if idea.get("needs_ticket") and idea.get("category") not in FOOD else ""
        r = idea.get("reservation") or {}
        if idea_id in moves:
            slot = (r.get("slots") or ["?"])[0]
            conf = f"，確認碼 {r['confirmation']}" if r.get("confirmation") else ""
            to = desired_time(idea, activities, trip, days).removeprefix("彈性：")
            lines.append(f"#{n} {idea['title']}{area} — 已訂 {slot}{conf}，但那天我們不在 {idea.get('area')}，"
                         f"請改到{to}，{party_size(trip)} 人")
        elif resize and r.get("status") == "booked":
            slot = (r.get("slots") or ["?"])[0]
            conf = f"，確認碼 {r['confirmation']}" if r.get("confirmation") else ""
            lines.append(f"#{n} {idea['title']}{area} — 已訂 {slot}（{resize[0]} 人{conf}），請改成 {resize[1]} 人")
        else:
            lines.append(f"#{n} {idea['title']}{kind}{area} — 希望：{desired_time(idea, activities, trip, days)}")

    subject = f"{SUBJECT_TAG} {trip['name']} {trip_key(trip_id)}"
    resize_rule = (
        f"- 人數從 {resize[0]} 人改成 {resize[1]} 人：寫「請改成 {resize[1]} 人」的是已經訂好的，請把訂位人數改掉"
        f"（改好回覆 BOOKED，備註附新的確認碼；改不了就回覆 AVAILABLE 並說明）。其他店一律照 {resize[1]} 人查。\n"
        if resize else ""
    )
    move_rule = (
        "- 寫「請改到」的是已經訂好、但訂在我們人不在那個城市的日子：請改到指定的日子"
        "（改好回覆 BOOKED，備註附新的確認碼；改不了就回覆 AVAILABLE 並附可訂時段），舊的訂位記得取消。\n"
        if moves else ""
    )
    body = f"""Muse 你好，

這是 Travel Planner 自動寄出的訂位請求。
旅程：{trip['name']}（{trip['country']}），{trip['start_date']} ~ {trip['end_date']}，{party_size(trip)} 人。

可以的時間（依航班算好的，只能訂在這些時間內，時間外的位子不要訂、也不要回報）：
{windows_text(free_windows(trip, activities))}

每晚住哪裡（沒排進行程的店，只能訂在我們人在那個城市的日子；退房那天只剩早上，之後就移動到下一個城市了）：
{stays_text(trip, accs, plan or [])}

規則：
- 不需要綁信用卡、也不需要預付的：請直接用 Jay Huang 的名義訂下最符合的時段。
- 需要綁卡／預付，或只能打電話訂的：不要訂，回報旅程期間可以訂的時段。
- 不收訂位、只能現場排隊的：註明 WALK_IN。
- 標「備選」的不在每日行程裡：不管要不要綁卡都先不要訂，只回報 AVAILABLE／NEEDS_CARD 和可訂時段。
- 標「門票／預約」的是景點或活動，不是餐廳：一律要付款，所以不要購買，回報 NEEDS_CARD、可以預約的時段，備註附上官方購票連結和票價。現場就能買票、不必先訂的回報 WALK_IN。
{resize_rule}{move_rule}
這次請處理的店與門票（目前全部還沒訂到）：
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
    food = {d.id: d.to_dict() for d in idea_docs if handled(d.to_dict())}
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
    accs = [a.to_dict() for a in db.collection("accommodations").where("trip_id", "==", child_id).stream()]
    plan = [d.to_dict() for d in idea_docs if d.to_dict().get("category") == "stay"]
    days = city_days(accs)
    windows = free_windows(trip, acts)
    manual = {i for i, d in food.items() if (d.get("reservation") or {}).get("manual")}
    for i, d in food.items():
        r = d.get("reservation") or {}
        if i in manual or r.get("status") not in ("available", "needs_card") or not r.get("slots"):
            continue
        sitting = 120 if d.get("category") == "bar" else 60 if d.get("category") == "cafe" else 90
        keep = [x for x in r["slots"] if slot_fits(x, windows, sitting) and slot_in_city(d.get("area", ""), x, days)]
        if keep == r["slots"]:
            continue
        res = {**r, "slots": keep}
        if not keep:
            # Nothing reported is reachable: ask again within the right times
            # rather than call it unavailable on the strength of bad windows.
            res.update(status="requested",
                       note="先前回報的時段都不在我們人在當地的時間（航班或住宿城市），已請 Muse 重新查詢。",
                       note_en="All reported times fell outside when we are there (flights or hotel city); Muse has been asked again.")
        print(f"  {d['title']}: dropped {len(r['slots']) - len(keep)} slot(s) outside the travel windows / city days")
        if not dry:
            db.collection("ideas").document(i).update({"reservation": res})
        d["reservation"] = res

    # 3. New request when something has never been sent, or the windows moved
    # (a flight was added or changed) since the last request.
    never_sent = [i for i, d in food.items() if i not in manual and not (d.get("reservation") or {}).get("requested_at")]
    # Booked, but on a day the hotels put the travellers in another city.
    # Asked about once per slot, so an unanswered move is not re-sent every run.
    asked = state.get("move_asked") or {}
    misplaced = {i: (d["reservation"].get("slots") or [""])[0] for i, d in food.items()
                 if i not in manual and (d.get("reservation") or {}).get("status") == "booked"
                 and d["reservation"].get("slots")
                 and not slot_in_city(d.get("area", ""), d["reservation"]["slots"][0], days)}
    moves = {i for i, slot in misplaced.items() if asked.get(i) != slot}
    # Hotels are part of the signature: a booked or changed stay moves the city days.
    sig = windows_sig({"windows": windows, "stays": sorted(
        [a.get("check_in", ""), a.get("check_out", ""), a.get("name", "")] for a in accs)})
    if state.get("windows_sig") is None and state.get("last_request_at"):
        # First run since windows existed: the earlier request told Muse
        # nothing about flights, which only matters if any day is restricted.
        restricted = any(w != (0, 24 * 60) for w in windows.values())
        moved = restricted
        if not restricted:
            state["windows_sig"] = sig
    else:
        moved = bool(state.get("last_request_at")) and state.get("windows_sig") != sig
    # The headcount changed since the last request: bookings already made are
    # for the old number, so they go back to Muse to be amended.
    people = party_size(trip)
    if state.get("party_size") is None:
        state["party_size"] = people
    resize = (int(state["party_size"]), people) if state.get("last_request_at") and state["party_size"] != people else None
    if never_sent or moved or resize or moves:
        open_ideas = sorted(
            # Booked is done (unless the headcount changed) and walk-in cannot
            # be booked: neither is otherwise worth asking about again.
            ((i, d) for i, d in food.items()
             if i not in manual and (d.get("reservation") or {}).get("status") != "walk_in"
             and (resize or i in misplaced or (d.get("reservation") or {}).get("status") != "booked")),
            key=lambda x: x[1].get("created_at", ""),
        )
        subject, body, refs = build_request(trip, trip_id, open_ideas, acts, resize, accs, plan, set(misplaced))
        print(f"  sending request: {len(open_ideas)} places ({len(never_sent)} new, {len(misplaced)} to move)")
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
                         last_request_at=now_iso(), refs=refs, windows_sig=sig, party_size=people,
                         move_asked={**asked, **misplaced})
            stamp = now_iso()
            for i, d in open_ideas:
                prev = d.get("reservation") or {}
                db.collection("ideas").document(i).update({"reservation": {
                    **prev, "status": prev.get("status") or "requested", "requested_at": stamp,
                }})

    state["processed"] = sorted(processed)[-200:]
    if not dry and state != (trip.get("reservation_thread") or {}):
        trip_ref.update({"reservation_thread": state})


# ── Hotel confirmations ──────────────────────────────────────────────────────
HOTEL_QUERY = (
    'newer_than:180d -subject:"muse定位串" '
    "subject:(reservation OR booking OR confirmation OR confirmed OR cancellation OR cancelled "
    "OR itinerary OR 預訂 OR 訂房 OR 確認 OR 取消)"
)
HOTEL_STATE = ("agent_state", "hotel_mail")
HOTEL_KINDS = ("confirmation", "modification", "cancellation")
MAX_NEW_PER_RUN = 40  # first run over 180 days of mail must fit the 300 s task timeout


def parse_hotel_email(subject: str, sender: str, text: str) -> dict | None:
    """One Gemini call per email: a hotel stay with its dates, or None for anything else."""
    text = re.sub(r"\[\]\(https?://[^)]*\)|https?://\S+", "", text)
    text = re.sub(r"[|\s]*\n[|\s]*\n+", "\n", text)
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"].lstrip(chr(0xFEFF)).strip())
    prompt = f"""判斷這封信是不是「住宿」的訂房確認、訂房變更或取消通知（飯店、民宿、Airbnb、Booking.com 等）。
餐廳訂位、機票、租車、行銷信、點數通知、入住前提醒以外的一般廣告都算 other。

- kind：confirmation（新訂房）／modification（同一筆訂房改了日期或房型）／cancellation（取消）／other
- name：飯店名稱，照原文
- address：完整地址，沒有就空字串
- check_in、check_out：YYYY-MM-DD，年份照信裡寫的
- confirmation：確認碼／訂單編號，沒有就空字串

寄件者：{sender}
標題：{subject}
內文：
\"\"\"
{text[:12000]}
\"\"\""""
    res = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=gtypes.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "kind": {"type": "STRING"},
                    "name": {"type": "STRING"},
                    "address": {"type": "STRING"},
                    "check_in": {"type": "STRING"},
                    "check_out": {"type": "STRING"},
                    "confirmation": {"type": "STRING"},
                },
                "required": ["kind"],
            },
        ),
    )
    r = json.loads(res.text or "{}")
    if r.get("kind") not in HOTEL_KINDS or not r.get("name"):
        return None
    try:
        if date.fromisoformat(r["check_out"]) <= date.fromisoformat(r["check_in"]):
            return None
    except (KeyError, ValueError):
        return None
    return {k: str(r.get(k) or "").strip() for k in ("kind", "name", "address", "check_in", "check_out", "confirmation")}


def booking_key(b: dict) -> str:
    """The confirmation number, so a modification email overwrites the stay it changes."""
    return b["confirmation"] or f"{norm_name(b['name'])}|{b['check_in']}"


def norm_name(s: str) -> str:
    return re.sub(r"[^0-9a-z一-鿿]", "", s.lower())


def match_trip(b: dict, trips: list[tuple[str, dict]]) -> tuple[str, dict] | None:
    """
    The trip whose dates hold the most nights of this stay. Dates, not country:
    the Spain trip has nights in Lisbon and Porto, and its single `country`
    field says Spain.
    """
    ci, co = date.fromisoformat(b["check_in"]), date.fromisoformat(b["check_out"])
    best, best_nights = None, 0
    for tid, t in trips:
        start, end = date.fromisoformat(t["start_date"]), date.fromisoformat(t["end_date"])
        # A stay's last night is the day before check-out, which may be the trip's last day.
        nights = (min(co, end + timedelta(days=1)) - max(ci, start)).days
        if nights > best_nights:
            best, best_nights = (tid, t), nights
    return best


def place_booking(db, child_id: str, b: dict, acc_id: str | None, dry: bool) -> str | None:
    """Write one stay onto a trip's accommodations; returns the accommodation's doc id."""
    accs = {d.id: d.to_dict() for d in db.collection("accommodations").where("trip_id", "==", child_id).stream()}
    if b["kind"] == "cancellation":
        gone = [i for i, a in accs.items() if i == acc_id or (b["confirmation"] and a.get("confirmation") == b["confirmation"])]
        for i in gone:
            print(f"    cancelled: removing {accs[i].get('name')} {accs[i].get('check_in')}")
            if not dry:
                db.collection("accommodations").document(i).delete()
        return None

    target = acc_id if acc_id in accs else next(
        (i for i, a in accs.items() if b["confirmation"] and a.get("confirmation") == b["confirmation"]), None)
    dupes: list[str] = []
    if target is None:
        # A row typed or scanned in by hand for the same hotel: adopt it rather
        # than add a second. Scanned rows have come in with the wrong year
        # (Le Méridien as 2020-12-28), so the name decides, not the dates.
        same = [i for i, a in accs.items() if not a.get("confirmation") and norm_name(a.get("name", "")) == norm_name(b["name"])]
        if same:
            target = same[0]
            first = accs[target]
            dupes = [i for i in same[1:] if (accs[i].get("check_in"), accs[i].get("check_out")) == (first.get("check_in"), first.get("check_out"))]

    address = b["address"] or (accs.get(target) or {}).get("address", "")
    fields = {
        "trip_id": child_id, "name": b["name"], "address": address,
        "check_in": b["check_in"], "check_out": b["check_out"],
        "map_url": "https://www.google.com/maps/search/?api=1&query=" + quote(f"{b['name']} {address}", safe=""),
        "confirmation": b["confirmation"], "source": "gmail", "updated_at": now_iso(),
    }
    verb = "updating" if target else "adding"
    print(f"    {verb} {b['name']} {b['check_in']} → {b['check_out']} #{b['confirmation']}"
          + (f" (and dropping {len(dupes)} duplicate)" if dupes else ""))
    if dry:
        return target
    for i in dupes:
        db.collection("accommodations").document(i).delete()
    if target:
        db.collection("accommodations").document(target).update(fields)
        return target
    ref = db.collection("accommodations").document()
    ref.set({**fields, "id": ref.id})
    return ref.id


def import_hotels(db, gmail, me: str, today: str, dry: bool) -> None:
    """
    Hotel confirmation emails in the mailbox -> accommodations on the trip they
    fall in. Each email is read once; each stay is written only when an email
    changes it, so a row deleted in the app stays deleted until the hotel
    sends something new about it.
    """
    state_ref = db.collection(HOTEL_STATE[0]).document(HOTEL_STATE[1])
    state = state_ref.get().to_dict() or {}
    processed = set(state.get("processed") or [])
    bookings: dict[str, dict] = dict(state.get("bookings") or {})

    ids = []
    req = gmail.users().messages().list(userId="me", q=HOTEL_QUERY, maxResults=100)
    while req is not None and len(ids) < 500:
        page = req.execute()
        ids += [m["id"] for m in page.get("messages", [])]
        req = gmail.users().messages().list_next(req, page)
    # Newest first, so a fresh booking is not stuck behind months of backlog;
    # `sent` then decides which email about one stay is the current word.
    new = [m for m in ids if m not in processed][:MAX_NEW_PER_RUN]
    for mid in new:
        msg = gmail.users().messages().get(userId="me", id=mid, format="full").execute()
        processed.add(mid)
        if header(msg, REQ_HEADER):
            continue
        b = parse_hotel_email(header(msg, "Subject"), header(msg, "From"), plain_text(msg["payload"]))
        if not b:
            continue
        key = booking_key(b)
        prev = bookings.get(key) or {}
        sent = int(msg.get("internalDate", 0))
        if sent < int(prev.get("sent", 0)):
            continue
        bookings[key] = {**b, "trip": prev.get("trip"), "acc_id": prev.get("acc_id"), "dirty": True, "sent": sent}
        print(f"  hotel mail {mid}: {b['kind']} {b['name']} {b['check_in']}→{b['check_out']} #{b['confirmation']}")

    trips = my_trips(db, me, today)
    for key, b in bookings.items():
        if not b.get("dirty") or b["check_out"] < today:
            continue
        hit = match_trip(b, trips)
        if hit is None:
            continue  # no trip for these dates yet: stays dirty, tried again once one exists
        child_id, trip = hit
        print(f"  → {trip.get('name')}")
        if b.get("trip") and b["trip"] != child_id and b.get("acc_id") and not dry:
            db.collection("accommodations").document(b["acc_id"]).delete()  # dates moved it to another trip
            b["acc_id"] = None
        b["acc_id"] = place_booking(db, child_id, b, b.get("acc_id"), dry)
        b.update(trip=child_id, dirty=False)

    state = {
        "processed": sorted(processed)[-3000:],
        "bookings": {k: v for k, v in bookings.items() if v["check_out"] >= today},
        "updated_at": now_iso(),
    }
    if not dry:
        state_ref.set(state)


def my_trips(db, me: str, today: str) -> list[tuple[str, dict]]:
    """(child id, trip) for every trip the mailbox owner is on that has not ended."""
    out = []
    for ref in db.collection("trips").stream():
        t = ref.to_dict()
        if (t.get("owner_id") == me or me in (t.get("shared_with") or [])) and t.get("start_date") and (t.get("end_date") or "") >= today:
            out.append((t.get("id") or ref.id, t))
    return out


# ── Muse updates (Jay → WhatsApp → Muse → email) ─────────────────────────────
UPDATE_TAG = "muse更新"
UPDATE_STATE = ("agent_state", "muse_updates")
IDEA_CATEGORIES = ("restaurant", "cafe", "bar", "landmark", "shopping", "other")


def parse_muse_update(text: str, trip_list: str) -> list[dict]:
    """Places in one [muse更新] email, each already assigned to a trip by number (0 = none fits)."""
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"].lstrip(chr(0xFEFF)).strip())
    prompt = f"""以下是訂位助理 Muse 寄來的地點更新：Jay 在 WhatsApp 丟給 Muse 的餐廳、景點，加上 Muse 查到的訂位結果。請整理成清單。

Jay 目前的行程（編號、名稱、國家、日期、住宿）：
{trip_list}

每個地點：
- name：店名或景點名，照原文
- category：restaurant / cafe / bar / landmark / shopping / other
- area：區域或城市
- maps_url：Google Maps 連結，沒有就空字串
- trip：屬於上面哪個行程的編號。依地點所在城市／國家、訂位日期、住宿在哪判斷（例如 Lisbon 的店在住宿有 Lisbon 的那趟）；Muse 有寫行程也參考，但地點和日期優先。判斷不了填 0。
- status：booked / available / needs_card / unavailable / walk_in；Muse 沒查訂位就填 none
- slots：已訂或可訂時段，每個 "YYYY-MM-DD HH:MM"；只寫月/日時，年份用落在該行程期間的那一年
- confirmation：確認碼，沒有就空字串
- why：一句話，為什麼值得去（Muse 有寫才填，繁體中文），沒有就空字串
- note、note_en：訂位相關的備註（訂金、人數、要打電話…），繁中與英文各一，沒有就空字串

Muse 的信：
\"\"\"
{text[:12000]}
\"\"\""""
    res = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=gtypes.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {"places": {"type": "ARRAY", "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"}, "category": {"type": "STRING"}, "area": {"type": "STRING"},
                        "maps_url": {"type": "STRING"}, "trip": {"type": "NUMBER"}, "status": {"type": "STRING"},
                        "slots": {"type": "ARRAY", "items": {"type": "STRING"}}, "confirmation": {"type": "STRING"},
                        "why": {"type": "STRING"}, "note": {"type": "STRING"}, "note_en": {"type": "STRING"},
                    },
                    "required": ["name", "trip"],
                }}},
                "required": ["places"],
            },
        ),
    )
    return [p for p in json.loads(res.text or "{}").get("places", []) if str(p.get("name") or "").strip()]


def fold(s: str) -> str:
    """Drop accents, so "Sagrada Família" and "Basilica of the Sagrada Familia" can match."""
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def same_place(a: str, b: str) -> bool:
    a, b = norm_name(fold(a)), norm_name(fold(b))
    return bool(a and b) and (a == b or (min(len(a), len(b)) >= 4 and (a in b or b in a)))


def upsert_muse_place(db, child_id: str, trip: dict, p: dict, ideas: dict[str, dict], dry: bool) -> str:
    stamp = now_iso()
    category = p.get("category") if p.get("category") in IDEA_CATEGORIES else "other"
    status = str(p.get("status") or "").lower()
    maps_url = str(p.get("maps_url") or "").strip()
    res = None
    if status in STATUSES:
        res = {"status": status, "slots": [in_trip_year(str(x), trip) for x in (p.get("slots") or [])],
               "confirmation": p.get("confirmation") or "", "note": p.get("note") or "",
               "note_en": p.get("note_en") or "", "updated_at": stamp}

    hit = next((i for i, d in ideas.items() if same_place(d.get("title", ""), p["name"])), None)
    if hit:
        d, patch = ideas[hit], {}
        if maps_url and "/maps/search/" in (d.get("map_url") or "/maps/search/"):
            patch["map_url"] = maps_url
        if p.get("area") and not d.get("area"):
            patch["area"] = p["area"]
        prev = d.get("reservation") or {}
        if res and not prev.get("manual"):
            patch["reservation"] = {**prev, **res, "requested_at": prev.get("requested_at") or stamp}
        if not patch:
            return f"{d['title']}: no change"
        if not dry:
            db.collection("ideas").document(hit).update(patch)
        d.update(patch)
        return f"{d['title']}: updated {', '.join(patch)}"

    area = str(p.get("area") or "")
    idea = {
        "trip_id": child_id, "title": p["name"].strip(), "category": category, "area": area,
        "note": p.get("why") or "", "duration": "",
        "map_url": maps_url or "https://www.google.com/maps/search/?api=1&query=" + quote(f"{p['name']} {area} {trip.get('country', '')}", safe=""),
        "source": maps_url or "Muse（WhatsApp）", "created_by": "Muse", "created_at": stamp, "status": "idea",
    }
    if res:
        # requested_at marks it as already in Muse's hands, so the request
        # step does not email Muse about a place Muse just reported on.
        idea["reservation"] = {**res, "requested_at": stamp}
    if not dry:
        ref = db.collection("ideas").document()
        ref.set(idea)
        ideas[ref.id] = idea
    return f"{idea['title']}: added ({category}{', ' + status if res else ''})"


def import_muse_updates(db, gmail, me: str, today: str, dry: bool) -> None:
    """
    [muse更新] emails -> ideas (with their booking state) on the right trip.

    Jay sends Muse links over WhatsApp; Muse emails them back here in batches.
    A place already in that trip's stash is updated rather than added twice;
    places no trip fits are sent back to Muse in one reply on the same thread.
    """
    state_ref = db.collection(UPDATE_STATE[0]).document(UPDATE_STATE[1])
    state = state_ref.get().to_dict() or {}
    processed = set(state.get("processed") or [])
    q = f'subject:"{UPDATE_TAG}" newer_than:60d'
    ids = [m["id"] for m in gmail.users().messages().list(userId="me", q=q, maxResults=50).execute().get("messages", [])]
    new = [m for m in reversed(ids) if m not in processed]  # oldest first: a later update wins
    if not new:
        return

    trips = my_trips(db, me, today)
    lines = []
    for n, (cid, t) in enumerate(trips, 1):
        stays = "、".join(f"{a.get('name')}（{a.get('address') or '—'}）"
                         for a in (d.to_dict() for d in db.collection("accommodations").where("trip_id", "==", cid).stream()))
        lines.append(f"{n}. {t.get('name')}｜{t.get('country')}｜{t['start_date']} ~ {t['end_date']}｜住宿：{stays or '未登記'}")
    trip_list = "\n".join(lines) or "（沒有進行中的行程）"
    stash: dict[str, dict[str, dict]] = {}

    for mid in new:
        msg = gmail.users().messages().get(userId="me", id=mid, format="full").execute()
        processed.add(mid)
        if header(msg, REQ_HEADER):
            continue
        text = strip_quoted(plain_text(msg["payload"]))
        if not text:
            continue
        places = parse_muse_update(text, trip_list)
        print(f"  muse update {mid}: {len(places)} places")
        unmatched = []
        for p in places:
            k = int(p.get("trip") or 0)
            if not 1 <= k <= len(trips):
                unmatched.append(p["name"])
                continue
            cid, trip = trips[k - 1]
            if cid not in stash:
                stash[cid] = {d.id: d.to_dict() for d in db.collection("ideas").where("trip_id", "==", cid).stream()}
            print(f"    [{trip.get('name')}] {upsert_muse_place(db, cid, trip, p, stash[cid], dry)}")
        if unmatched:
            print(f"    no trip for: {', '.join(unmatched)}")
            body = ("Muse 你好，\n\n這幾個地點對不到 Jay 現有的行程，所以沒有加進去：\n"
                    + "\n".join(f"- {n}" for n in unmatched)
                    + "\n\n如果是還沒建立的行程，等行程建好之後再寄一次就好；如果是寫錯城市，請更正後重寄。\n\n目前的行程：\n"
                    + trip_list + "\n")
            if not dry:
                em = EmailMessage()
                em["To"] = MAILBOX
                em["From"] = MAILBOX
                em["Subject"] = "Re: " + header(msg, "Subject").removeprefix("Re: ")
                em[REQ_HEADER] = "muse-update"
                if header(msg, "Message-ID"):
                    em["In-Reply-To"] = header(msg, "Message-ID")
                    em["References"] = header(msg, "Message-ID")
                em.set_content(body)
                sent = gmail.users().messages().send(userId="me", body={
                    "raw": base64.urlsafe_b64encode(em.as_bytes()).decode(), "threadId": msg["threadId"]}).execute()
                processed.add(sent["id"])

    if not dry:
        state_ref.set({"processed": sorted(processed)[-1000:], "updated_at": now_iso()})


# ── Google Maps list (shared list -> stash) ──────────────────────────────────
# A list link as shared, and the data= form a maps.app.goo.gl short link ends up at.
LIST_RE = re.compile(r"placelists/list/([\w-]+)|!11m\d+!2s([\w-]+)")
LIST_API = ("https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us"
            "&pb=!1m4!1s{id}!2e1!3m1!1e1!2e2!3e2!4i500!16b1")
BROWSER = {"User-Agent": "Mozilla/5.0"}
LIST_KINDS = ("restaurant", "cafe", "bar", "landmark", "shopping", "other", "skip")


def maps_list_id(url: str) -> str | None:
    """The list id in a long link, or in where a maps.app.goo.gl short link redirects to."""
    m = LIST_RE.search(unquote(url))
    if not m:
        with urllib.request.urlopen(urllib.request.Request(url, headers=BROWSER), timeout=20) as r:
            m = LIST_RE.search(unquote(r.geturl()))
    return (m.group(1) or m.group(2)) if m else None


def fetch_maps_list(list_id: str) -> tuple[str, list[dict]]:
    """
    Title and places of a Google Maps list shared by link.

    Google has no API for saved lists; this is the endpoint the Maps web app
    loads a shared list from. It needs no sign-in and answers JSON behind the
    usual )]}' prefix. The positions below are what it returned in 2026-10; a
    place that no longer fits them is skipped rather than guessed at.
    """
    req = urllib.request.Request(LIST_API.format(id=list_id), headers=BROWSER)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8").split("\n", 1)[1])[0]
    places = []
    for it in data[8] or []:
        try:
            cid = int(it[1][6][1]) % (1 << 64)  # signed in the payload, unsigned in ?cid=
            places.append({
                "key": str(cid), "name": str(it[2]).strip(), "address": it[1][4] or "", "note": it[3] or "",
                "maps_url": f"https://maps.google.com/?cid={cid}",
                "by": it[12][0] if len(it) > 12 and it[12] else "",
            })
        except (IndexError, TypeError, ValueError):
            continue
    return str(data[4] or ""), [p for p in places if p["name"]]


def classify_list_places(places: list[dict], ideas: dict[str, dict], trip: dict) -> list[dict]:
    """One Gemini call for a batch of new list places: kind, city, ticket, and any stash duplicate."""
    titles = sorted({d.get("title", "") for d in ideas.values()} - {""})
    areas = sorted({d.get("area", "") for d in ideas.values()} - {""})
    listing = "\n".join(f"#{n} {p['name']}｜{p['address']}｜{p['note']}" for n, p in enumerate(places, 1))
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"].lstrip(chr(0xFEFF)).strip())
    prompt = f"""以下是 Jay 的 Google Maps 清單裡新加的地點，行程是 {trip.get('name')}（{trip.get('country')}），{trip['start_date']} ~ {trip['end_date']}。
每個編號都要回一筆，skip 的也要回（ref 填 # 後面的編號）：
- kind：restaurant / cafe / bar / landmark / shopping / other；甜點、冰淇淋、麵包店算 cafe。
  整個城市、地區、國家的圖釘（例如只寫 "Porto"、"Seville"），或飯店住宿本身，填 skip。
- area：所在城市，用英文常見寫法；收藏區已經用過的寫法優先：{'、'.join(areas) or '（無）'}
- needs_ticket：景點要事先買票或預約入場時段才進得去（例如 Sagrada Família、Alhambra、Casa Milà）填 true；免費、現場買就好、或餐廳咖啡廳都填 false。
- same_as：如果和收藏區已有的某個地點是同一個地方（包含它的入口、售票處、寫法不同），填那個地點的名稱，一字不差；否則空字串。

收藏區已有的地點：
{chr(10).join('- ' + t for t in titles) or '（無）'}

新地點：
{listing}"""
    res = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=gtypes.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {"places": {"type": "ARRAY", "items": {
                    "type": "OBJECT",
                    "properties": {
                        "ref": {"type": "NUMBER"}, "kind": {"type": "STRING"}, "area": {"type": "STRING"},
                        "needs_ticket": {"type": "BOOLEAN"}, "same_as": {"type": "STRING"},
                    },
                    "required": ["ref", "kind", "area", "needs_ticket", "same_as"],
                }}},
                "required": ["places"],
            },
        ),
    )
    by_ref = {int(v.get("ref", 0)): v for v in json.loads(res.text or "{}").get("places", [])}
    # A pin with no street number is a whole city or country ("Porto | Portugal").
    # Gemini tends to leave those out rather than answer skip.
    return [by_ref.get(n) or {"kind": "other" if re.search(r"\d", p["address"]) else "skip"}
            for n, p in enumerate(places, 1)]


def add_list_place(db, child_id: str, p: dict, v: dict, ideas: dict[str, dict], dry: bool) -> str:
    kind = v.get("kind") if v.get("kind") in LIST_KINDS else "other"
    if kind == "skip":
        return f"{p['name']}: skipped (city or hotel)"
    same_as = str(v.get("same_as") or "").strip()
    hit = next((i for i, d in ideas.items()
                if same_place(d.get("title", ""), p["name"]) or (same_as and d.get("title") == same_as)), None)
    if hit:
        d, patch = ideas[hit], {}
        if "/maps/search/" in (d.get("map_url") or "/maps/search/"):
            patch["map_url"] = p["maps_url"]
        if v.get("area") and not d.get("area"):
            patch["area"] = v["area"]
        if p["note"] and not d.get("note"):
            patch["note"] = p["note"]
        if v.get("needs_ticket") and not d.get("needs_ticket") and d.get("category") not in FOOD:
            patch["needs_ticket"] = True
        if patch and not dry:
            db.collection("ideas").document(hit).update(patch)
        d.update(patch)
        return f"{p['name']}: already stashed as {d['title']}" + (f", updated {', '.join(patch)}" if patch else "")

    idea = {
        "trip_id": child_id, "title": p["name"], "category": kind, "area": str(v.get("area") or ""),
        "note": p["note"], "duration": "", "map_url": p["maps_url"], "source": p["maps_url"],
        "created_by": p["by"] or "Google Maps", "created_at": now_iso(), "status": "idea",
        **({"needs_ticket": True} if v.get("needs_ticket") and kind not in FOOD else {}),
    }
    if not dry:
        ref = db.collection("ideas").document()
        ref.set(idea)
        ideas[ref.id] = idea
    return f"{p['name']}: added ({kind}{', ticket' if idea.get('needs_ticket') else ''}, {idea['area']})"


def import_maps_lists(db, today: str, dry: bool) -> None:
    """
    Every trip with a Google Maps list linked in the app: places added to the
    list since the last run become stash ideas, and the trip loop below emails
    Muse about the bookable ones in the same run.

    A place is remembered by its Maps id once seen, so deleting its idea in
    the app is final; it is not re-added on the next run.
    """
    for ref in db.collection("trips").stream():
        trip = ref.to_dict()
        ml = trip.get("maps_list") or {}
        if not ml.get("url") or (trip.get("end_date") or "") < today:
            continue
        print(f"maps list for {trip.get('name')}")
        try:
            list_id = ml.get("id") or maps_list_id(ml["url"])
            if not list_id:
                raise ValueError("not a Google Maps list link")
            title, places = fetch_maps_list(list_id)
        except Exception as e:
            print(f"  ERROR: {e!r}")
            if not dry:
                ref.reference.update({"maps_list.error": str(e)[:200], "maps_list.synced_at": now_iso()})
            continue
        seen = set(ml.get("seen") or [])
        new = [p for p in places if p["key"] not in seen]
        if new:
            child_id = trip.get("id") or ref.id
            ideas = {d.id: d.to_dict() for d in db.collection("ideas").where("trip_id", "==", child_id).stream()}
            for p, v in zip(new, classify_list_places(new, ideas, trip)):
                print(f"  {add_list_place(db, child_id, p, v, ideas, dry)}")
        # Field paths, so a link changed in the app meanwhile is not overwritten.
        if not dry:
            ref.reference.update({
                "maps_list.id": list_id, "maps_list.title": title, "maps_list.count": len(places),
                "maps_list.seen": sorted(seen | {p["key"] for p in places}),
                "maps_list.synced_at": now_iso(), "maps_list.error": firestore.DELETE_FIELD,
            })


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    db = firestore.Client(project=FIRESTORE_PROJECT)
    has_token = bool(os.environ.get("GMAIL_TOKEN")) or TOKEN_FILE.exists()
    gmail = gmail_service() if has_token or not args.dry_run else None
    today = date.today().isoformat()
    if gmail is not None:
        me = next((u.id for u in db.collection("users").where("email", "==", MAILBOX).stream()), None)
        try:
            if me:
                import_hotels(db, gmail, me, today, args.dry_run)
        except Exception as e:  # hotels must not stop the Muse relay
            print(f"hotels ERROR: {e!r}")
        try:
            if me:
                import_muse_updates(db, gmail, me, today, args.dry_run)
        except Exception as e:
            print(f"muse updates ERROR: {e!r}")
    try:
        import_maps_lists(db, today, args.dry_run)
    except Exception as e:
        print(f"maps lists ERROR: {e!r}")
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
