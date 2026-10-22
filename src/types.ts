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
  suggested_plan?: {
    /** Where the plan came from, for the "from …" line. */
    source?: string;
    days: SuggestedDay[];
  };
}

export interface SuggestedDay {
  date: string;
  title: string;
  /** One or two sentences on why the day is shaped this way. */
  summary?: string;
  stops: SuggestedStop[];
}

export interface SuggestedStop {
  id: string;
  start_time: string;
  end_time: string;
  activity: string;
  area?: string;
  note?: string;
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
}

export interface Accommodation {
  id: string;
  trip_id: string;
  name: string;
  address: string;
  check_in: string;
  check_out: string;
  map_url: string;
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
  category: 'restaurant' | 'cafe' | 'landmark' | 'shopping' | 'stay' | 'other';
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
