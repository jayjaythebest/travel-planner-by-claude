export interface Trip {
  id: string;
  documentId?: string; // Firestore document ID
  name: string;
  start_date: string;
  end_date: string;
  country: string;
  owner_id: string;
  shared_with: string[]; // Array of user IDs
}

export interface User {
  id: string;
  username: string;
  password: string;
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
