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
}

export interface ChecklistItem {
  id: string;
  trip_id: string;
  item: string;
  is_checked: boolean;
}
