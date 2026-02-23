export interface Trip {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  country: string;
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
