export interface Trip {
  id: string;
  documentId?: string; // Firestore document ID
  name: string;
  start_date: string;
  end_date: string;
  country: string;
  owner_id: string;
  shared_with: string[]; // Array of user IDs
  /**
   * What this app has already put in the user's Google Calendar.
   *
   * Kept on the trip rather than on each activity for two reasons: an activity
   * deleted in the app takes its row with it, and the event id with it, so a
   * later sync could never clean up after it; and the travel-time fields on
   * Activity are write-sensitive (see CLAUDE.md) and do not need a sync writing
   * to every one of them.
   */
  /**
   * Per traveller: what this app put in THAT person's Google Calendar, and
   * which activities they chose to leave out. Keyed by uid because each
   * member syncs to their own calendar — one shared map made a second member's
   * sync try to patch event ids that only existed in the first one's calendar.
   */
  gcal_users?: Record<string, {
    events: Record<string, string>;
    syncedAt: string;
    /** Activity ids left off. Stored as exclusions so new activities default to included. */
    excluded?: string[];
  }>;
  /** Legacy single-calendar map, from before gcal_users. Read once as the owner's. */
  gcal?: {
    /** activity id -> Google event id. */
    events: Record<string, string>;
    /** ISO timestamp of the last successful sync, for the button's subtitle. */
    syncedAt: string;
  };
  /**
   * A day-by-day plan proposed for this trip but not yet on it — shown in the
   * overview as "suggested" until someone imports it into real activities.
   *
   * On the trip rather than in its own collection because trip members can
   * already update the trip under the existing rules, and a plan is small.
   * Imported stops are flagged rather than removed so a half-imported day
   * cannot offer the same stop twice.
   */
  /**
   * People who share costs but are not on the app. They only take part in
   * expense splitting, under ids prefixed "guest_" so they can never collide
   * with a Firebase uid.
   */
  guests?: { id: string; name: string }[];
  /** Destination photo for the overview header, fetched once and cached here. */
  cover_url?: string;
  /** Opt-in: the reservation-agent only emails Muse about trips with this on. */
  reservations_enabled?: boolean;
  /** Headcount for bookings; falls back to the number of members. */
  party_size?: number;
  /** The reservation-agent's email thread for this trip; only timestamps are read here. */
  reservation_thread?: {
    last_request_at?: string;
    last_reply_at?: string;
  };
  /**
   * A Google Maps list shared by link. The reservation-agent reads it every
   * 10 minutes: places new to it become stash ideas, and the bookable ones go
   * to Muse. The app writes only `url`; the rest is the agent's.
   */
  maps_list?: {
    url: string;
    title?: string;
    count?: number;
    synced_at?: string;
    error?: string;
  };
  suggested_plan?: {
    /** Where the plan came from, for the "from …" line. */
    source?: string;
    days: SuggestedDay[];
  };
}

export interface SuggestedDay {
  date: string;
  /** English; the *_zh fields are the same text in Chinese, picked by UI language. */
  title: string;
  title_zh?: string;
  /** One or two sentences on why the day is shaped this way. */
  summary?: string;
  summary_zh?: string;
  stops: SuggestedStop[];
}

export interface SuggestedStop {
  id: string;
  start_time: string;
  end_time: string;
  activity: string;
  area?: string;
  note?: string;
  note_zh?: string;
  /** Title of the stash idea this stop places, so importing marks it scheduled. */
  idea_title?: string;
  imported?: boolean;
}

export interface User {
  /** The Firebase Auth uid. Also the id of this user's `users/{uid}` profile. */
  id: string;
  username: string;
  email?: string;
  role: 'admin' | 'user';
}

export interface Activity {
  id: string;
  trip_id: string;
  date: string;
  start_time: string;
  end_time: string;
  activity: string;
  map_url: string;
  note: string;
  is_flight: boolean;
  travel_mode: 'walking' | 'transit' | 'driving';
  ai_advice?: string;
  travel_time_to_next?: string;
  photo_url?: string;
  /**
   * Time zones for this one activity, overriding the trip country's.
   *
   * Exists for flights. Everything else in a trip happens at the destination,
   * but an outbound flight departs from home: 09:55 on a Taipei→Aomori leg is
   * 09:55 in Taipei, and stamping it Asia/Tokyo — which is what the trip's
   * single `country` field says — puts it on the calendar an hour early.
   * Absent means "use the trip's zone", which is right for every non-flight.
   */
  start_tz?: string;
  end_tz?: string;
  /**
   * Flights only: uids of the travellers on this flight. Absent means everyone
   * on the trip — the state of every flight added before this existed, and the
   * honest reading of a flight added when the trip had one traveller.
   */
  passengers?: string[];
  /** The stash idea this activity was placed from, when it came from a booking. */
  idea_id?: string;
  /**
   * Flights only: Gemini's airport <-> lodging estimate, cached the first time
   * the day is viewed. Keyed by direction; `acc_id` is the lodging it was
   * worked out for, so changing hotels recomputes it.
   */
  transfer_estimates?: Partial<Record<'arrive' | 'depart', { acc_id: string; data: TransferEstimate }>>;
  /** Set on an activity created from a transfer card: "<flight id>:arrive|depart". */
  transfer_of?: string;
}

export interface TransferEstimate {
  taxi: { minutes: number; cost: string };
  /** Null when public transport is not a realistic option at that hour. */
  transit: { minutes: number; cost: string; route: string } | null;
  tip: string;
}

export interface Accommodation {
  id: string;
  trip_id: string;
  name: string;
  address: string;
  check_in: string;
  check_out: string;
  map_url: string;
  /** Set when the stay came from (or was matched to) a hotel's confirmation email. */
  confirmation?: string;
  /** 'gmail': written by the reservation-agent, which rewrites it when the hotel emails a change. */
  source?: 'gmail';
}

export interface Expense {
  id: string;
  trip_id: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
  /**
   * Splitting. `paid_by` is the uid who paid; `split_with` the uids it is
   * shared equally among (the payer included if they had a share). Both absent
   * or empty means the expense is not split and stays out of settle-up — every
   * expense recorded before splitting existed is in that state.
   */
  paid_by?: string;
  split_with?: string[];
}

export interface ChecklistItem {
  id: string;
  trip_id: string;
  item: string;
  is_checked: boolean;
}

/**
 * A place someone wants to go but has not scheduled yet.
 *
 * The stash exists because planning a trip with other people happens in the
 * wrong order: links and screenshots arrive weeks before anyone knows which
 * day they are free. An Idea is deliberately NOT an Activity with a null date
 * — an Activity without a date would leak into every day-filtered view, the
 * PDF and the calendar sync, all of which assume `date` is real.
 *
 * `status` is kept rather than deleting a scheduled idea, because the stash is
 * shared: a friend who proposed somewhere should be able to see it landed
 * rather than find it gone.
 */
export interface Idea {
  id: string;
  trip_id: string;
  title: string;
  category: 'restaurant' | 'cafe' | 'bar' | 'landmark' | 'shopping' | 'stay' | 'other';
  /** Neighbourhood or nearest station, as free text. */
  area?: string;
  /** Why it is worth going — the one line that survives from the source. */
  note?: string;
  /** Rough visit length, e.g. "1-2 小時". Shown so a day can be packed sanely. */
  duration?: string;
  map_url?: string;
  /** Where it came from: a URL, or 手動 for a typed one. */
  source?: string;
  /** Display name of whoever added it, so a shared stash reads as a conversation. */
  created_by: string;
  created_at: string;
  status: 'idea' | 'scheduled';
  /** Set when status flips to scheduled; the day it was placed on. */
  scheduled_date?: string;
  /** A sight that needs a ticket booked ahead (timed entry, a balloon); Muse checks these too. */
  needs_ticket?: boolean;
  /**
   * Booking state for restaurants, cafés and bars, written by the
   * reservation-agent Cloud Run Job from Muse's email replies. The app only
   * reads it.
   */
  reservation?: Reservation;
}

export interface Reservation {
  status: 'requested' | 'booked' | 'available' | 'needs_card' | 'unavailable' | 'walk_in';
  /** "YYYY-MM-DD HH:MM" — the booked time, or the times that can be booked. */
  slots?: string[];
  confirmation?: string;
  /** Chinese; `note_en` is the same sentence in English, picked by UI language. */
  note?: string;
  note_en?: string;
  /** Set by the ✓/✕ buttons in the app; the reservation-agent leaves such places alone. */
  manual?: boolean;
  requested_at?: string;
  updated_at?: string;
}

/**
 * A photo attached to an Idea, stored as a compressed JPEG data URL.
 *
 * Firestore rather than Storage because the project has no Storage bucket and
 * no billing account, and Storage on a *.firebasestorage.app bucket requires
 * the Blaze plan. One document per photo, in its own collection, so a single
 * document stays well under Firestore's 1 MiB cap and the ideas listener does
 * not drag image bytes along with every title edit.
 */
export interface IdeaPhoto {
  id: string;
  trip_id: string;
  idea_id: string;
  data_url: string;
  created_by: string;
  created_at: string;
}
