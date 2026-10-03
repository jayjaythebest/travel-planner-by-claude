import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  MapPin, 
  Plane, 
  Hotel, 
  Wallet, 
  Calendar, 
  ChevronRight, 
  Camera, 
  Sparkles, 
  Navigation,
  ArrowLeft,
  X,
  Loader2,
  Trash2,
  PieChart,
  Utensils,
  ShoppingBag,
  Bus,
  MoreHorizontal,
  Download,
  Share2,
  Users,
  CalendarCheck,
  FileUp,
  LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, COUNTRY_LIST, CURRENCY_OPTIONS, EXCHANGE_RATES, TIMEZONE_MAP, TIME_ZONE_OPTIONS, isValidTimeZone } from './utils';
import { Trip, Activity, Expense, Accommodation, ChecklistItem, Idea, User } from './types';
import { geminiService } from './services/geminiService';
import { auth, db, googleProvider } from './services/firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { Modal } from './components/Modal';
import { ImportItineraryModal, type ImportDraft } from './components/ImportItineraryModal';
import { DestinationPicker } from './components/DestinationPicker';
import { TripOverview } from './components/TripOverview';
import { syncTripToCalendar, CalendarError } from './services/googleCalendar';
import { 
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  getDocs,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { notoSansTCRegular } from './assets/NotoSansTC-Regular';
import { sourceHanSerifBold as notoSerifTCBold } from './assets/SourceHanSerif-Bold';




// ── Country-themed card helpers ──────────────────────────────────────────
type CountryTheme = {
  gradient: string;
  borderColor: string;
  flagEmoji: string;
  landmark: React.ReactNode;
};

function getCountryTheme(country: string): CountryTheme {
  const c = (country || '').toLowerCase();

  if (c.includes('japan') || c.includes('日本')) return {
    gradient: 'linear-gradient(130deg, #fff0f0 0%, #ffffff 60%)',
    borderColor: '#fecaca',
    flagEmoji: '🇯🇵',
    landmark: (
      <svg width="130" height="100" viewBox="0 0 130 100" fill="none">
        <path d="M5 88 L65 12 L125 88 Z" fill="#dc2626" fillOpacity="0.12"/>
        <path d="M50 30 Q65 12 80 30 L74 38 Q65 26 56 38 Z" fill="white" fillOpacity="0.5"/>
        <ellipse cx="65" cy="89" rx="55" ry="4" fill="#dc2626" fillOpacity="0.05"/>
      </svg>
    )
  };

  if (c.includes('thailand') || c.includes('泰國') || c.includes('泰国')) return {
    gradient: 'linear-gradient(130deg, #fffbeb 0%, #eff6ff 60%)',
    borderColor: '#fde68a',
    flagEmoji: '🇹🇭',
    landmark: (
      <svg width="100" height="120" viewBox="0 0 100 120" fill="none">
        <path d="M50 5 L58 35 L55 35 L60 55 L56 55 L62 75 L38 75 L44 55 L40 55 L45 35 L42 35 Z" fill="#d97706" fillOpacity="0.14"/>
        <path d="M22 42 L27 60 L25 60 L30 75 L14 75 L19 60 L17 60 Z" fill="#1d4ed8" fillOpacity="0.11"/>
        <path d="M78 42 L83 60 L81 60 L86 75 L70 75 L75 60 L73 60 Z" fill="#1d4ed8" fillOpacity="0.11"/>
        <rect x="30" y="75" width="40" height="15" fill="#d97706" fillOpacity="0.09" rx="2"/>
        <rect x="10" y="88" width="80" height="10" fill="#d97706" fillOpacity="0.07" rx="2"/>
      </svg>
    )
  };

  if (c.includes('france') || c.includes('法國') || c.includes('法国') || c.includes('paris')) return {
    gradient: 'linear-gradient(130deg, #eff6ff 0%, #ffffff 60%)',
    borderColor: '#bfdbfe',
    flagEmoji: '🇫🇷',
    landmark: (
      <svg width="80" height="130" viewBox="0 0 80 130" fill="none">
        <path d="M15 115 L35 55 L45 55 L65 115 Z" fill="#1e40af" fillOpacity="0.11"/>
        <path d="M27 55 L33 25 L47 25 L53 55 Z" fill="#1e40af" fillOpacity="0.11"/>
        <path d="M33 25 L38 8 L42 8 L47 25 Z" fill="#1e40af" fillOpacity="0.11"/>
        <line x1="40" y1="8" x2="40" y2="2" stroke="#1e40af" strokeWidth="2" strokeOpacity="0.15"/>
        <rect x="20" y="53" width="40" height="3" fill="#1e40af" fillOpacity="0.08" rx="1"/>
        <rect x="29" y="23" width="22" height="3" fill="#1e40af" fillOpacity="0.08" rx="1"/>
      </svg>
    )
  };

  if (c.includes('korea') || c.includes('韓國') || c.includes('韩国')) return {
    gradient: 'linear-gradient(130deg, #fff0f0 0%, #eff6ff 60%)',
    borderColor: '#fecaca',
    flagEmoji: '🇰🇷',
    landmark: (
      <svg width="130" height="90" viewBox="0 0 130 90" fill="none">
        <path d="M5 52 Q65 18 125 52 L120 62 Q65 28 10 62 Z" fill="#dc2626" fillOpacity="0.13"/>
        <rect x="25" y="62" width="80" height="20" fill="#1d4ed8" fillOpacity="0.08" rx="1"/>
        <rect x="34" y="62" width="4" height="20" fill="#1d4ed8" fillOpacity="0.12"/>
        <rect x="49" y="62" width="4" height="20" fill="#1d4ed8" fillOpacity="0.12"/>
        <rect x="64" y="62" width="4" height="20" fill="#1d4ed8" fillOpacity="0.12"/>
        <rect x="79" y="62" width="4" height="20" fill="#1d4ed8" fillOpacity="0.12"/>
        <rect x="94" y="62" width="4" height="20" fill="#1d4ed8" fillOpacity="0.12"/>
        <path d="M52 82 Q65 70 78 82" fill="none" stroke="#1d4ed8" strokeOpacity="0.15" strokeWidth="2"/>
      </svg>
    )
  };

  if (c.includes('italy') || c.includes('義大利') || c.includes('意大利') || c.includes('roma') || c.includes('rome')) return {
    gradient: 'linear-gradient(130deg, #fffbeb 0%, #ffffff 60%)',
    borderColor: '#fde68a',
    flagEmoji: '🇮🇹',
    landmark: (
      <svg width="130" height="90" viewBox="0 0 130 90" fill="none">
        <ellipse cx="65" cy="55" rx="58" ry="30" fill="none" stroke="#f59e0b" strokeOpacity="0.18" strokeWidth="3"/>
        <ellipse cx="65" cy="55" rx="44" ry="22" fill="none" stroke="#f59e0b" strokeOpacity="0.13" strokeWidth="2"/>
        <path d="M18 38 Q22 28 26 38" fill="none" stroke="#f59e0b" strokeOpacity="0.14" strokeWidth="1.5"/>
        <path d="M34 33 Q38 23 42 33" fill="none" stroke="#f59e0b" strokeOpacity="0.14" strokeWidth="1.5"/>
        <path d="M50 30 Q54 20 58 30" fill="none" stroke="#f59e0b" strokeOpacity="0.14" strokeWidth="1.5"/>
        <path d="M66 30 Q70 20 74 30" fill="none" stroke="#f59e0b" strokeOpacity="0.14" strokeWidth="1.5"/>
        <path d="M82 33 Q86 23 90 33" fill="none" stroke="#f59e0b" strokeOpacity="0.14" strokeWidth="1.5"/>
        <path d="M98 38 Q102 28 106 38" fill="none" stroke="#f59e0b" strokeOpacity="0.14" strokeWidth="1.5"/>
        <ellipse cx="65" cy="84" rx="56" ry="4" fill="#f59e0b" fillOpacity="0.05"/>
      </svg>
    )
  };

  if (c.includes('uk') || c.includes('england') || c.includes('英國') || c.includes('英国') || c.includes('london') || c.includes('britain')) return {
    gradient: 'linear-gradient(130deg, #eff6ff 0%, #fff0f0 60%)',
    borderColor: '#bfdbfe',
    flagEmoji: '🇬🇧',
    landmark: (
      <svg width="70" height="130" viewBox="0 0 70 130" fill="none">
        <rect x="22" y="30" width="26" height="80" fill="#1e3a8a" fillOpacity="0.11" rx="2"/>
        <circle cx="35" cy="50" r="10" fill="none" stroke="#1e3a8a" strokeOpacity="0.14" strokeWidth="2"/>
        <path d="M18 30 L35 8 L52 30 Z" fill="#1e3a8a" fillOpacity="0.11"/>
        <line x1="35" y1="8" x2="35" y2="2" stroke="#1e3a8a" strokeWidth="2" strokeOpacity="0.18"/>
        <rect x="30" y="70" width="10" height="15" fill="#1e3a8a" fillOpacity="0.08" rx="1"/>
        <rect x="15" y="110" width="40" height="10" fill="#1e3a8a" fillOpacity="0.07" rx="2"/>
      </svg>
    )
  };

  if (c.includes('australia') || c.includes('澳大利亞') || c.includes('澳洲') || c.includes('sydney')) return {
    gradient: 'linear-gradient(130deg, #f0f9ff 0%, #ffffff 60%)',
    borderColor: '#bae6fd',
    flagEmoji: '🇦🇺',
    landmark: (
      <svg width="130" height="80" viewBox="0 0 130 80" fill="none">
        <path d="M20 65 Q35 20 65 65 Z" fill="#0284c7" fillOpacity="0.12"/>
        <path d="M50 65 Q70 28 90 65 Z" fill="#0284c7" fillOpacity="0.12"/>
        <path d="M75 65 Q85 44 100 65 Z" fill="#0284c7" fillOpacity="0.10"/>
        <rect x="10" y="63" width="110" height="5" fill="#0284c7" fillOpacity="0.09" rx="3"/>
        <rect x="5" y="67" width="120" height="4" fill="#0284c7" fillOpacity="0.06" rx="2"/>
      </svg>
    )
  };

  if (c.includes('singapore') || c.includes('新加坡')) return {
    gradient: 'linear-gradient(130deg, #fff0f0 0%, #ffffff 60%)',
    borderColor: '#fecaca',
    flagEmoji: '🇸🇬',
    landmark: (
      <svg width="110" height="110" viewBox="0 0 110 110" fill="none">
        <rect x="10" y="30" width="22" height="65" fill="#dc2626" fillOpacity="0.11" rx="2"/>
        <rect x="44" y="25" width="22" height="70" fill="#dc2626" fillOpacity="0.11" rx="2"/>
        <rect x="78" y="30" width="22" height="65" fill="#dc2626" fillOpacity="0.11" rx="2"/>
        <path d="M5 28 Q55 14 105 28 L105 35 Q55 21 5 35 Z" fill="#dc2626" fillOpacity="0.14"/>
        <path d="M8 18 Q55 6 102 18 L102 22 Q55 10 8 22 Z" fill="#38bdf8" fillOpacity="0.14"/>
      </svg>
    )
  };

  if (c.includes('usa') || c.includes('america') || c.includes('美國') || c.includes('美国')) return {
    gradient: 'linear-gradient(130deg, #eff6ff 0%, #fff0f0 60%)',
    borderColor: '#bfdbfe',
    flagEmoji: '🇺🇸',
    landmark: (
      <svg width="90" height="120" viewBox="0 0 90 120" fill="none">
        <ellipse cx="45" cy="108" rx="20" ry="8" fill="#1e40af" fillOpacity="0.08"/>
        <rect x="38" y="60" width="14" height="48" fill="#1e40af" fillOpacity="0.10" rx="2"/>
        <path d="M30 60 Q45 30 60 60 L55 62 Q45 38 35 62 Z" fill="#1e40af" fillOpacity="0.10"/>
        <rect x="34" y="56" width="22" height="6" fill="#1e40af" fillOpacity="0.10" rx="1"/>
        <path d="M40 30 L45 15 L50 30 L47 28 L43 28 Z" fill="#f59e0b" fillOpacity="0.20"/>
        <path d="M35 22 L29 12" stroke="#f59e0b" strokeOpacity="0.18" strokeWidth="1.5"/>
        <path d="M55 22 L61 12" stroke="#f59e0b" strokeOpacity="0.18" strokeWidth="1.5"/>
        <path d="M45 15 L45 5" stroke="#f59e0b" strokeOpacity="0.18" strokeWidth="1.5"/>
      </svg>
    )
  };

  if (c.includes('taiwan') || c.includes('台灣') || c.includes('台湾')) return {
    gradient: 'linear-gradient(130deg, #eff6ff 0%, #ffffff 60%)',
    borderColor: '#bfdbfe',
    flagEmoji: '🇹🇼',
    landmark: (
      <svg width="80" height="130" viewBox="0 0 80 130" fill="none">
        <rect x="30" y="90" width="20" height="15" fill="#1d4ed8" fillOpacity="0.11" rx="1"/>
        <rect x="28" y="78" width="24" height="14" fill="#1d4ed8" fillOpacity="0.11" rx="1"/>
        <rect x="26" y="66" width="28" height="14" fill="#1d4ed8" fillOpacity="0.11" rx="1"/>
        <rect x="28" y="54" width="24" height="14" fill="#1d4ed8" fillOpacity="0.11" rx="1"/>
        <rect x="30" y="42" width="20" height="14" fill="#1d4ed8" fillOpacity="0.11" rx="1"/>
        <rect x="32" y="30" width="16" height="14" fill="#1d4ed8" fillOpacity="0.11" rx="1"/>
        <rect x="34" y="20" width="12" height="12" fill="#1d4ed8" fillOpacity="0.11" rx="1"/>
        <line x1="40" y1="20" x2="40" y2="4" stroke="#1d4ed8" strokeWidth="2.5" strokeOpacity="0.17"/>
        <rect x="20" y="105" width="40" height="8" fill="#1d4ed8" fillOpacity="0.07" rx="2"/>
      </svg>
    )
  };

  if (c.includes('hong kong') || c.includes('香港')) return {
    gradient: 'linear-gradient(130deg, #fff0f0 0%, #fffbeb 60%)',
    borderColor: '#fecaca',
    flagEmoji: '🇭🇰',
    landmark: (
      <svg width="130" height="100" viewBox="0 0 130 100" fill="none">
        <rect x="10" y="40" width="14" height="55" fill="#dc2626" fillOpacity="0.10" rx="1"/>
        <rect x="28" y="25" width="14" height="70" fill="#dc2626" fillOpacity="0.10" rx="1"/>
        <rect x="46" y="30" width="12" height="65" fill="#dc2626" fillOpacity="0.10" rx="1"/>
        <rect x="62" y="20" width="16" height="75" fill="#dc2626" fillOpacity="0.12" rx="1"/>
        <rect x="82" y="35" width="14" height="60" fill="#dc2626" fillOpacity="0.10" rx="1"/>
        <rect x="100" y="28" width="12" height="67" fill="#dc2626" fillOpacity="0.10" rx="1"/>
        <line x1="70" y1="20" x2="70" y2="5" stroke="#dc2626" strokeWidth="2" strokeOpacity="0.15"/>
        <path d="M0 94 Q65 88 130 94 L130 100 L0 100 Z" fill="#38bdf8" fillOpacity="0.10"/>
      </svg>
    )
  };

  // Default
  return {
    gradient: 'linear-gradient(130deg, #fafafa 0%, #ffffff 60%)',
    borderColor: '#e4e4e7',
    flagEmoji: '✈️',
    landmark: (
      <svg width="120" height="80" viewBox="0 0 120 80" fill="none">
        <path d="M20 45 L65 28 L100 40 L65 37 Z" fill="#71717a" fillOpacity="0.10"/>
        <path d="M45 28 L55 14 L65 28 Z" fill="#71717a" fillOpacity="0.10"/>
        <path d="M55 37 L58 48 L65 37 Z" fill="#71717a" fillOpacity="0.10"/>
        <ellipse cx="88" cy="20" rx="18" ry="9" fill="#71717a" fillOpacity="0.06"/>
        <ellipse cx="76" cy="22" rx="12" ry="7" fill="#71717a" fillOpacity="0.06"/>
        <ellipse cx="24" cy="25" rx="14" ry="8" fill="#71717a" fillOpacity="0.06"/>
      </svg>
    )
  };
}

// ── Flight card helpers ───────────────────────────────────────────────────
const AIRPORT_MAP: [string[], string][] = [
  [['TAOYUAN', 'TAIPEI', 'TPE'], 'TPE'],
  [['NARITA', 'NRT'], 'NRT'],
  [['HANEDA', 'HND'], 'HND'],
  [['KANSAI', 'KIX'], 'KIX'],
  [['ITAMI', 'ITM'], 'ITM'],
  [['CHITOSE', 'CTS', 'SAPPORO'], 'CTS'],
  [['FUKUOKA', 'FUK'], 'FUK'],
  [['NAHA', 'OKA', 'OKINAWA'], 'OKA'],
  [['HONG KONG', 'HKG'], 'HKG'],
  [['CHANGI', 'SINGAPORE', 'SIN'], 'SIN'],
  [['SUVARNABHUMI', 'BANGKOK', 'BKK'], 'BKK'],
  [['INCHEON', 'SEOUL', 'ICN'], 'ICN'],
  [['PUDONG', 'SHANGHAI', 'PVG'], 'PVG'],
  [['CHARLES DE GAULLE', 'PARIS', 'CDG'], 'CDG'],
  [['HEATHROW', 'LONDON', 'LHR'], 'LHR'],
  [['LOS ANGELES', 'LAX'], 'LAX'],
  [['KENNEDY', 'JFK'], 'JFK'],
  [['SYDNEY', 'SYD'], 'SYD'],
  [['BEIJING', 'PEK'], 'PEK'],
  [['KUALA LUMPUR', 'KUL'], 'KUL'],
  [['DENPASAR', 'BALI', 'DPS'], 'DPS'],
  [['MANILA', 'MNL'], 'MNL'],
  [['JAKARTA', 'CGK'], 'CGK'],
];

function getAirportCode(name: string): string {
  const n = name.toUpperCase();
  for (const [keywords, code] of AIRPORT_MAP) {
    if (keywords.some(k => n.includes(k))) return code;
  }
  return n.replace(/[^A-Z]/g, '').slice(0, 3) || '???';
}

function parseFlightActivity(activity: string): { flightNo: string; departure: string; arrival: string } | null {
  const flightNoMatch = activity.match(/([A-Z]{1,3}\d+)/);
  if (!flightNoMatch) return null;
  const parenMatch = activity.match(/\(([^)]+)\)/);
  if (!parenMatch) return null;
  const parts = parenMatch[1].split('🛫');
  if (parts.length !== 2) return null;
  return { flightNo: flightNoMatch[1], departure: parts[0].trim(), arrival: parts[1].trim() };
}

function calcFlightDuration(startTime: string, endTime: string): string {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? ` ${mins % 60}m` : ''}`.trim();
}

function getTripNights(startDate: string, endDate: string): string {
  const nights = differenceInDays(parseISO(endDate), parseISO(startDate));
  return `${nights + 1}天${nights}夜`;
}

function getTripStatus(startDate: string, endDate: string): { label: string; color: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const daysUntil = differenceInDays(start, today);
  if (daysUntil > 0) return { label: `出發還有 ${daysUntil} 天`, color: 'text-blue-500' };
  if (today <= end) return { label: '旅程進行中', color: 'text-emerald-600' };
  return { label: '已完成', color: 'text-zinc-400' };
}

/**
 * The value `activeTab` takes for the overview, which is not a day.
 *
 * A sentinel rather than a separate piece of state so that exactly one thing
 * decides what the content area shows. It is deliberately not a date string:
 * every `activeTab` consumer below either compares it to a real date (and so
 * fails closed) or is guarded, and a value that could never be a date makes
 * the two cases impossible to confuse.
 */
const OVERVIEW_TAB = 'overview';

export default function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [isAddingTrip, setIsAddingTrip] = useState(false);
  const [isImportingItinerary, setIsImportingItinerary] = useState(false);
  // Kept across opens on purpose: consecutive trips are usually to the same place.
  const [newTripCountry, setNewTripCountry] = useState(COUNTRY_LIST[0]);
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [isAddingFlight, setIsAddingFlight] = useState(false);
  const [isAddingAccommodation, setIsAddingAccommodation] = useState(false);
  const [isExpenseAnalysisOpen, setIsExpenseAnalysisOpen] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [isCoreInfoExpanded, setIsCoreInfoExpanded] = useState(true);
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportEmail, setExportEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [aiInputText, setAiInputText] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);

  // Form States for AI population
  const [flightForm, setFlightForm] = useState({
    flightNo: '',
    departureAirport: '',
    arrivalAirport: '',
    departureTime: '',
    arrivalTime: '',
    date: '',
    // Empty means "the trip's zone". Resolved at submit rather than defaulted
    // here, because this state is created before a trip is ever selected.
    departureTimeZone: '',
    arrivalTimeZone: ''
  });

  const [accommodationForm, setAccommodationForm] = useState({
    name: '',
    address: '',
    check_in: '',
    check_out: ''
  });

  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    currency: 'USD',
    category: '飲食',
    date: format(new Date(), 'yyyy-MM-dd')
  });
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const openEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseForm({
      description: expense.description,
      amount: expense.amount.toString(),
      currency: expense.currency,
      category: expense.category,
      date: expense.date,
    });
    setIsAddingExpense(true);
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('確定要刪除此支出嗎？')) return;
    try {
      await deleteDoc(doc(db, 'expenses', id));
    } catch (err) {
      console.error(err);
    }
  };
  const [loading, setLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<Record<string, string>>({});
  const [dailyNeedInput, setDailyNeedInput] = useState('');
  const [dailyNeedOpen, setDailyNeedOpen] = useState(false);
  const [dailyNeedLoading, setDailyNeedLoading] = useState(false);
  const [dailyNeedSuggestion, setDailyNeedSuggestion] = useState<Record<string, string>>({}); // keyed by date
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  // Holds the id of the trip being deleted, so only that card shows a spinner.
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [calendarMessage, setCalendarMessage] = useState('');

  // Multi-user states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [isManagingBuddies, setIsManagingBuddies] = useState(false);
  const [tripToManage, setTripToManage] = useState<Trip | null>(null);
  const [showTotalExpense, setShowTotalExpense] = useState(false);
  const [showAiActivityInput, setShowAiActivityInput] = useState(false);
  const [aiActivityText, setAiActivityText] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [activityStartTime, setActivityStartTime] = useState('09:00');
  const [activityEndTime, setActivityEndTime] = useState('11:00');

  const generateTimeSlots = () => {
    const slots = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  };

  const addTwoHours = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const totalMins = h * 60 + m + 120;
    const endH = Math.floor(totalMins / 60) % 24;
    const endM = totalMins % 60;
    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  };

  const handleStartTimeChange = (time: string) => {
    setActivityStartTime(time);
    setActivityEndTime(addTwoHours(time));
  };

  /**
   * The only place currentUser is set. Firebase Auth owns the session now —
   * it persists it itself, so nothing is kept in localStorage: a session there
   * was a JSON blob anyone could edit, including the `role` field.
   *
   * The profile doc is what the app reads for username and role, because the
   * Google account supplies neither. It is created on first sign-in with
   * role 'user'; the rules forbid a client from granting itself 'admin', so
   * promoting someone is deliberately a console-side act.
   */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setCurrentUser(null);
        setTrips([]);
        setSelectedTrip(null);
        setIsLoginOpen(true);
        return;
      }
      try {
        const profileRef = doc(db, "users", fbUser.uid);
        const snap = await getDoc(profileRef);
        if (snap.exists()) {
          const data = snap.data() as { username?: string; email?: string; role?: 'admin' | 'user' };
          setCurrentUser({
            id: fbUser.uid,
            username: data.username || fbUser.displayName || fbUser.email || '旅人',
            email: data.email || fbUser.email || undefined,
            role: data.role === 'admin' ? 'admin' : 'user',
          });
        } else {
          const profile = {
            username: fbUser.displayName || fbUser.email || '旅人',
            email: fbUser.email || '',
            role: 'user' as const,
          };
          await setDoc(profileRef, profile);
          setCurrentUser({ id: fbUser.uid, ...profile });
        }
        setIsLoginOpen(false);
      } catch (err) {
        console.error(err);
        setLoginError('讀取使用者資料失敗，請重新登入。');
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as User[];
        setAllUsers(usersData);
      });
      return () => unsubUsers();
    }
  }, [currentUser]);

  const handleGoogleLogin = async () => {
    setLoginError('');
    setLoading(true);
    try {
      // onAuthStateChanged above does the rest; nothing to set here.
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setLoginError(
        code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
          ? '登入視窗被關閉，尚未登入。'
          : code === 'auth/popup-blocked'
            ? '登入視窗被瀏覽器封鎖，請允許彈出式視窗後再試。'
            : '登入失敗，請稍後再試。',
      );
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateBuddies = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tripToManage) return;
    const formData = new FormData(e.currentTarget);
    const sharedWith = formData.getAll('shared_with') as string[];
    
    try {
      await updateDoc(doc(db, "trips", tripToManage.documentId || tripToManage.id), {
        shared_with: sharedWith
      });
      // trips are kept in sync via onSnapshot listener — no manual fetch needed
      setIsManagingBuddies(false);
      setTripToManage(null);
    } catch (err) {
      console.error(err);
      alert('更新失敗');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('確定要刪除此使用者嗎？')) return;
    try {
      await deleteDoc(doc(db, "users", id));
    } catch (err) {
      console.error(err);
    }
  };

  // useEffect(() => {
  //   if (activities.length > 0) {
  //     calculateAllTravelTimes();
  //   }
  // }, [activities]);

  // useEffect(() => {
  //   if (selectedTrip && activities.length > 0) {
  //     const fetchMissingAdvice = async () => {
  //       const missing = activities.filter(a => !a.is_flight && !aiAdvice[a.activity]);
  //       for (const activity of missing) {
  //         try {
  //           const advice = await geminiService.getItineraryAdvice(activity.activity, selectedTrip.country);
  //           setAiAdvice(prev => ({ ...prev, [activity.activity]: advice || '暫無建議' }));
  //         } catch (err) {
  //           console.error(err);
  //         }
  //       }
  //     };
  //     fetchMissingAdvice();
  //   }
  // }, [activities, selectedTrip]);

  // Calculate travel time between two consecutive activities and persist to Firestore
  const calcAndSaveTravelTime = async (current: Activity, next: Activity, country: string) => {
    if (current.travel_time_to_next) return; // Already stored, skip
    try {
      const time = await geminiService.getTravelTime(current.activity, next.activity, country, next.travel_mode);
      if (time) {
        await updateDoc(doc(db, 'activities', current.id), { travel_time_to_next: time });
      }
    } catch (err) {
      console.error('Travel time error:', err);
    }
  };

  // Only trigger calculation for pairs that are missing stored travel time
  useEffect(() => {
    if (!selectedTrip || activities.length === 0 || !activeTab) return;
    const dayActivities = activities
      .filter(a => a.date === activeTab)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    if (dayActivities.length < 2) return;
    dayActivities.forEach((activity, idx) => {
      if (idx === dayActivities.length - 1) return;
      if (!activity.travel_time_to_next) {
        calcAndSaveTravelTime(activity, dayActivities[idx + 1], selectedTrip.country);
      }
    });
  }, [activities, activeTab, selectedTrip]);

  const calculateAllTravelTimes = async () => {
    const times: Record<string, string> = {};
    const dates = [...new Set(activities.map(a => a.date))];
    
    for (const date of dates) {
      const dayActivities = activities
        .filter(a => a.date === date)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      
      for (let i = 0; i < dayActivities.length - 1; i++) {
        const current = dayActivities[i];
        const next = dayActivities[i + 1];
        const key = `${current.id}-${next.id}`;
        
        try {
          const res = await fetch(`/api/travel-time?origin=${encodeURIComponent(current.activity)}&destination=${encodeURIComponent(next.activity)}&mode=${next.travel_mode}`);
          const data = await res.json();
          if (data.duration) {
            times[key] = `${data.duration} (${data.distance})`;
          }
        } catch (err) {
          console.error(err);
        }
      }
    }

  };

  useEffect(() => {
    if (currentUser) {
      fetchTrips();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!selectedTrip) return;

    const activitiesQuery = query(collection(db, "activities"), where("trip_id", "==", selectedTrip.id));
    const expensesQuery = query(collection(db, "expenses"), where("trip_id", "==", selectedTrip.id));
    const accommodationsQuery = query(collection(db, "accommodations"), where("trip_id", "==", selectedTrip.id));
    const checklistQuery = query(collection(db, "checklist"), where("trip_id", "==", selectedTrip.id));
    const ideasQuery = query(collection(db, "ideas"), where("trip_id", "==", selectedTrip.id));

    const unsubActivities = onSnapshot(activitiesQuery, (snapshot) => {
      const activitiesData = snapshot.docs.map(doc => {
        const data = doc.data();
        return { ...data, id: doc.id };
      }) as Activity[];
      setActivities(activitiesData);
    });

    const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => {
        const data = doc.data();
        return { ...data, id: doc.id };
      }) as Expense[];
      setExpenses(expensesData);
    });

    const unsubAccommodations = onSnapshot(accommodationsQuery, (snapshot) => {
      const accommodationsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return { ...data, id: doc.id };
      }) as Accommodation[];
      setAccommodations(accommodationsData);
    });

    const unsubChecklist = onSnapshot(checklistQuery, (snapshot) => {
      const checklistData = snapshot.docs.map(doc => {
        const data = doc.data();
        return { ...data, id: doc.id };
      }) as ChecklistItem[];
      setChecklist(checklistData);
    });

    const unsubIdeas = onSnapshot(ideasQuery, (snapshot) => {
      const ideasData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Idea[];
      // Oldest first, so the stash reads in the order the group thought of
      // things rather than reshuffling every time someone adds one.
      ideasData.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      setIdeas(ideasData);
    });

    return () => {
      unsubActivities();
      unsubExpenses();
      unsubAccommodations();
      unsubChecklist();
      unsubIdeas();
    };
  }, [selectedTrip]);

  const fetchTrips = async () => {
    if (!currentUser) return;
    const tripsCollection = collection(db, "trips");
    let tripsList: Trip[] = [];
    
    try {
      if (currentUser.role === 'admin') {
        const tripsSnapshot = await getDocs(tripsCollection);
        tripsList = tripsSnapshot.docs.map(doc => {
          const data = doc.data();
          // Backward compatibility: use data.id if it exists (old UUID), otherwise use doc.id
          // Store Firestore doc ID in documentId for operations like update/delete
          return { ...data, id: data.id || doc.id, documentId: doc.id } as Trip;
        });
      } else {
        // For regular users, check both owner_id and shared_with
        const q = query(tripsCollection, where("shared_with", "array-contains", currentUser.id));
        const tripsSnapshot = await getDocs(q);
        const sharedTrips = tripsSnapshot.docs.map(doc => {
          const data = doc.data();
          return { ...data, id: data.id || doc.id, documentId: doc.id } as Trip;
        });

        const q2 = query(tripsCollection, where("owner_id", "==", currentUser.id));
        const tripsSnapshot2 = await getDocs(q2);
        const ownedTrips = tripsSnapshot2.docs.map(doc => {
          const data = doc.data();
          return { ...data, id: data.id || doc.id, documentId: doc.id } as Trip;
        });

        // Merge and remove duplicates
        const combined = [...sharedTrips, ...ownedTrips];
        tripsList = Array.from(new Map(combined.map(item => [item.id, item])).values());
      }
      // Newest first. Sorted here rather than at render because this is the
      // one place the list is built — every caller (create, import, first
      // load) goes through it, and the calendar sync only maps over what is
      // already here.
      tripsList.sort((a, b) => {
        const byStart = (b.start_date || '').localeCompare(a.start_date || '');
        if (byStart !== 0) return byStart;
        // Same departure day: the one that ends later is the longer trip and
        // reads as the more significant of the two.
        const byEnd = (b.end_date || '').localeCompare(a.end_date || '');
        if (byEnd !== 0) return byEnd;
        // Never return 0 on distinct rows, or the order shuffles between
        // renders on engines with an unstable sort for the remaining ties.
        return (a.name || '').localeCompare(b.name || '');
      });
      setTrips(tripsList);
    } catch (err) {
      console.error("Error fetching trips:", err);
    }
  };

  

  

  

  

  

  /**

   * Write an approved import: one trip, then its activities, accommodations

   * and checklist items.

   *

   * The draft carries day offsets rather than dates, because an itinerary

   * document says "Day One". Day 1 lands on the date the user picked in the

   * review step and everything else is derived, so moving a trip is a matter

   * of re-importing with a different start date rather than editing N rows.

   *

   * trip_id is the new trip's DOCUMENT id and no `id` field is written, which

   * matches handleCreateTrip. Legacy trips carry a UUID `id` that their

   * activities point at instead, and that divergence is what stops Firestore

   * rules from checking trip ownership on these collections (see

   * firestore.rules) — new trips should not add to the pile.

   *

   * Throws rather than swallowing: the modal keeps the review open and says

   * nothing was created, which is only honest if a failure really does reach

   * it. A partially written trip is still possible if the network dies

   * mid-loop; the trip list shows it and it can be deleted.

   */

  const handleImportItinerary = async (draft: ImportDraft) => {

    if (!currentUser) throw new Error('not signed in');

    const start = parseISO(draft.startDate);

    const dateFor = (day: number) => format(addDays(start, day - 1), 'yyyy-MM-dd');



    const tripRef = await addDoc(collection(db, "trips"), {

      name: draft.name.trim(),

      start_date: draft.startDate,

      end_date: dateFor(Math.max(draft.dayCount, 1)),

      country: draft.country,

      owner_id: currentUser.id,

      shared_with: [],

    });

    const tripId = tripRef.id;



    for (const day of draft.days) {

      for (const a of day.activities) {

        await addDoc(collection(db, "activities"), {

          id: crypto.randomUUID(),

          trip_id: tripId,

          date: dateFor(day.day),

          start_time: a.start_time,

          end_time: a.end_time,

          activity: a.activity,

          map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(draft.country + ' ' + a.activity)}`,

          note: a.note,

          is_flight: false,

          travel_mode: 'transit',

        });

      }

    }



    for (const acc of draft.accommodations) {

      await addDoc(collection(db, "accommodations"), {

        id: crypto.randomUUID(),

        trip_id: tripId,

        name: acc.name,

        address: acc.address,

        check_in: dateFor(acc.check_in_day),

        check_out: dateFor(acc.check_out_day),

        map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(acc.name + ' ' + acc.address)}`,

      });

    }



    for (const item of draft.checklist) {

      await addDoc(collection(db, "checklist"), {

        trip_id: tripId,

        item,

        is_checked: false,

      });

    }



    await fetchTrips();

  };



  const handleSelectTrip = (trip: Trip) => {
    setSelectedTrip(trip);
    setActiveTab(OVERVIEW_TAB);
  };

  const handleCreateTrip = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    const formData = new FormData(e.currentTarget);
    const sharedWith = formData.getAll('shared_with') as string[];
    
    const newTrip = {
      name: formData.get('name') as string,
      start_date: formData.get('start_date') as string,
      end_date: formData.get('end_date') as string,
      country: formData.get('country') as string,
      owner_id: currentUser.id,
      shared_with: sharedWith,
    };
    await addDoc(collection(db, "trips"), newTrip);
    fetchTrips();
    setIsAddingTrip(false);
  };

  const handleAddActivity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTrip) return;
    const formData = new FormData(e.currentTarget);
    let activityName = formData.get('activity') as string;
    const mapUrl = formData.get('map_url') as string;

    // Auto-fill activity name from Google Maps URL if empty
    if (!activityName && mapUrl) {
      try {
        // Try to extract from standard Google Maps URL patterns
        // Pattern 1: .../place/PLACE_NAME/...
        const placeMatch = mapUrl.match(/\/place\/([^/]+)/);
        if (placeMatch && placeMatch[1]) {
          activityName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
        } else {
          // Pattern 2: query=PLACE_NAME
          const queryMatch = mapUrl.match(/query=([^&]+)/);
          if (queryMatch && queryMatch[1]) {
            activityName = decodeURIComponent(queryMatch[1].replace(/\+/g, ' '));
          }
        }
      } catch (e) {
        console.error("Failed to parse map URL", e);
      }
      
      // Fallback if parsing failed
      if (!activityName) {
        activityName = "新行程";
      }
    }

    const newActivity = {
      id: crypto.randomUUID(),
      trip_id: selectedTrip.id,
      date: formData.get('date') as string,
      start_time: formData.get('start_time') as string,
      end_time: formData.get('end_time') as string,
      activity: activityName,
      map_url: mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedTrip.country + ' ' + activityName)}`,
      note: formData.get('note') as string,
      is_flight: formData.get('is_flight') === 'on',
      travel_mode: formData.get('travel_mode') as string || 'transit',
    };
    
    const docRef = await addDoc(collection(db, "activities"), newActivity);
    setIsAddingActivity(false);

    // Fetch AI advice + place photo asynchronously
    if (!newActivity.is_flight) {
      geminiService.getItineraryAdvice(activityName, selectedTrip.country)
        .then(advice => { if (advice) updateDoc(docRef, { ai_advice: advice }); })
        .catch(err => console.error("Failed to fetch AI advice", err));

      geminiService.getActivityPhoto(activityName, selectedTrip.country)
        .then(photoUrl => { if (photoUrl) updateDoc(docRef, { photo_url: photoUrl }); })
        .catch(err => console.error("Failed to fetch activity photo", err));
    }
  };

  const handleAddFlight = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTrip) return;
    
    const { flightNo, date, departureTime, arrivalTime, arrivalAirport, departureAirport } = flightForm;

    // Only stored when they differ from the trip's own zone: an all-Japan
    // domestic leg on a Japan trip needs no override, and writing one would be
    // a second copy of the same fact to keep in step.
    const tripZone = TIMEZONE_MAP[selectedTrip.country] ?? 'Asia/Taipei';
    const departureZone = flightForm.departureTimeZone || tripZone;
    const arrivalZone = flightForm.arrivalTimeZone || tripZone;

    const newActivity = {
      id: crypto.randomUUID(),
      trip_id: selectedTrip.id,
      date,
      start_time: departureTime,
      end_time: arrivalTime,
      ...(departureZone !== tripZone ? { start_tz: departureZone } : {}),
      ...(arrivalZone !== tripZone ? { end_tz: arrivalZone } : {}),
      activity: `✈️ 航班: ${flightNo} (${departureAirport} 🛫 ${arrivalAirport})`,
      map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(arrivalAirport)}`,
      note: `自動生成航班行程`,
      is_flight: true,
      travel_mode: 'transit',
    };

    try {
            await addDoc(collection(db, "activities"), newActivity);
      setIsAddingFlight(false);
      setFlightForm({ flightNo: '', departureAirport: '', arrivalAirport: '', departureTime: '', arrivalTime: '', date: '', departureTimeZone: '', arrivalTimeZone: '' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddAccommodation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTrip) return;
    
    const { name, address, check_in, check_out } = accommodationForm;

    const newAcc = {
      id: crypto.randomUUID(),
      trip_id: selectedTrip.id,
      name,
      address,
      check_in,
      check_out,
      map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + address)}`,
    };

    try {
            await addDoc(collection(db, "accommodations"), newAcc);
      setIsAddingAccommodation(false);
      setAccommodationForm({ name: '', address: '', check_in: '', check_out: '' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTrip) return;
    const formData = new FormData(e.currentTarget);
    const fields = {
      description: formData.get('description') as string,
      category: formData.get('category') as string,
      amount: parseFloat(formData.get('amount') as string),
      currency: formData.get('currency') as string,
      date: expenseForm.date,
    };
    if (editingExpense) {
      await updateDoc(doc(db, 'expenses', editingExpense.id), fields);
      setEditingExpense(null);
    } else {
      await addDoc(collection(db, 'expenses'), { id: crypto.randomUUID(), trip_id: selectedTrip.id, ...fields });
    }
    setIsAddingExpense(false);
    setExpenseForm({ description: '', amount: '', currency: 'USD', category: '飲食', date: format(new Date(), 'yyyy-MM-dd') });
  };

  const getAdvice = async (activity: string) => {
    if (!selectedTrip || aiAdvice[activity]) return;
    setLoading(true);
    try {
      const advice = await geminiService.getItineraryAdvice(activity, selectedTrip.country);
      setAiAdvice(prev => ({ ...prev, [activity]: advice || '暫無建議' }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const result = await geminiService.analyzeReceipt(base64, file.type);
        setExpenseForm({
          description: result.item || '',
          amount: result.amount?.toString() || '',
          currency: result.currency || 'USD',
          category: result.category || '飲食',
          date: format(new Date(), 'yyyy-MM-dd')
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };


  const handleScanActivity = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const res = await geminiService.parseActivityInfo('', base64, file.type);
        // Pre-fill the form but don't submit yet
        const form = document.querySelector('form[name="activityForm"]') as HTMLFormElement;
        if (form) {
          if (res.activity) (form.elements.namedItem('activity') as HTMLInputElement).value = res.activity;
          if (res.date) (form.elements.namedItem('date') as HTMLSelectElement).value = res.date;
          if (res.start_time) { setActivityStartTime(res.start_time); setActivityEndTime(addTwoHours(res.start_time)); }
          if (res.end_time) setActivityEndTime(res.end_time);
          if (res.note) (form.elements.namedItem('note') as HTMLTextAreaElement).value = res.note;
          if (res.map_url) (form.elements.namedItem('map_url') as HTMLInputElement).value = res.map_url;
        }
        setShowAiActivityInput(false);
      } catch (err) {
        console.error(err);
        alert('解析失敗，請稍後再試');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAiActivityTextSubmit = async () => {
    if (!aiActivityText.trim()) return;
    setLoading(true);
    try {
      const res = await geminiService.parseActivityInfo(aiActivityText);
      const form = document.querySelector('form[name="activityForm"]') as HTMLFormElement;
      if (form) {
        if (res.activity) (form.elements.namedItem('activity') as HTMLInputElement).value = res.activity;
        if (res.date) (form.elements.namedItem('date') as HTMLSelectElement).value = res.date;
        if (res.start_time) { setActivityStartTime(res.start_time); setActivityEndTime(addTwoHours(res.start_time)); }
        if (res.end_time) setActivityEndTime(res.end_time);
        if (res.note) (form.elements.namedItem('note') as HTMLTextAreaElement).value = res.note;
        if (res.map_url) (form.elements.namedItem('map_url') as HTMLInputElement).value = res.map_url;
      }
      setShowAiActivityInput(false);
      setAiActivityText('');
    } catch (err) {
      console.error(err);
      alert('解析失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleScanFlight = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const res = await geminiService.parseFlightInfo('', base64, file.type);
        setFlightForm({
          flightNo: res.flightNo || '',
          departureAirport: res.departureAirport || '',
          arrivalAirport: res.arrivalAirport || '',
          departureTime: res.departureTime || '',
          arrivalTime: res.arrivalTime || '',
          date: res.date || getDateRange()[0],
          // A model asked for an IANA name can answer 'JST' or invent one, and
          // an unknown zone makes the Calendar API reject the whole event. Drop
          // anything this browser does not recognise and fall back to the trip.
          departureTimeZone: isValidTimeZone(res.departureTimeZone) ? res.departureTimeZone : '',
          arrivalTimeZone: isValidTimeZone(res.arrivalTimeZone) ? res.arrivalTimeZone : ''
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const generatePdfBlob = async (): Promise<Blob | null> => {
    if (!selectedTrip) return null;
    setLoading(true);
    try {
      const translated = await geminiService.translateItinerary({
        trip: selectedTrip, activities, accommodations,
      });
      const tTrip = translated.trip || selectedTrip;
      // Fix: sort by date first, then start_time
      const tActivities = ((translated.activities || activities) as Activity[])
        .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
      const tAccommodations = (translated.accommodations || accommodations) as Accommodation[];

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      if (notoSansTCRegular) {
        doc.addFileToVFS('NotoSansTC-Regular.ttf', notoSansTCRegular);
        doc.addFont('NotoSansTC-Regular.ttf', 'NotoSansTC', 'normal');
        doc.setFont('NotoSansTC');
      }
      if (notoSerifTCBold) {
        doc.addFileToVFS('NotoSerifTC-Bold.ttf', notoSerifTCBold);
        doc.addFont('NotoSerifTC-Bold.ttf', 'NotoSerifTC', 'bold');
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      // ── Colour palette ──────────────────────────────────────────────────
      const C_BLUE     = [37,  99,  235] as [number, number, number]; // blue-600
      const C_SLATE    = [71,  85,  105] as [number, number, number]; // slate-600
      const C_SLATE100 = [241, 245, 249] as [number, number, number]; // slate-100
      const C_SLATE200 = [226, 232, 240] as [number, number, number]; // slate-200

      // ── Top accent bar ──────────────────────────────────────────────────
      doc.setFillColor(...C_BLUE);
      doc.rect(0, 0, pageWidth, 2.5, 'F');

      // ── Trip title ──────────────────────────────────────────────────────
      doc.setFont('NotoSerifTC', 'bold');
      doc.setFontSize(20);
      doc.setTextColor('#0f172a');
      doc.text(tTrip.name, 15, 20);

      doc.setFont('NotoSansTC', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor('#64748b');
      doc.text(
        `${tTrip.country}   ·   ${tTrip.start_date}  –  ${tTrip.end_date}   ·   ${getDateRange().length} days`,
        15, 28
      );

      // thin blue rule under header
      doc.setDrawColor(...C_BLUE);
      doc.setLineWidth(0.4);
      doc.line(15, 32, pageWidth - 15, 32);
      doc.setLineWidth(0.2);

      let currentY = 41;

      // helper: section label with left colour mark
      const sectionLabel = (text: string, color: [number, number, number]) => {
        if (currentY > 255) { doc.addPage(); currentY = 20; }
        doc.setFillColor(...color);
        doc.rect(15, currentY - 3, 2, 5.5, 'F');
        doc.setFont('NotoSansTC', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...color);
        doc.text(text.toUpperCase(), 20, currentY + 1.5);
        currentY += 9;
      };

      // ── Flights ─────────────────────────────────────────────────────────
      const flights = tActivities.filter(a => a.is_flight);
      if (flights.length > 0) {
        sectionLabel('Flight Information', C_BLUE);
        autoTable(doc, {
          startY: currentY,
          head: [['Flight No.', 'Date', 'Departure', 'Arrival', 'Duration']],
          body: flights.map(f => {
            const p = parseFlightActivity(f.activity);
            return [
              p?.flightNo || f.activity.slice(0, 16),
              f.date,
              `${f.start_time}  ${p ? getAirportCode(p.departure) : ''}`,
              `${f.end_time}  ${p ? getAirportCode(p.arrival) : ''}`,
              calcFlightDuration(f.start_time, f.end_time),
            ];
          }),
          theme: 'plain',
          styles: { font: 'NotoSansTC', fontStyle: 'normal', fontSize: 8.5, cellPadding: 2.5, textColor: '#0f172a' },
          headStyles: { fillColor: C_BLUE, textColor: [255,255,255], fontSize: 7.5 },
          alternateRowStyles: { fillColor: C_SLATE100 },
          margin: { left: 15, right: 15 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      // ── Accommodations ──────────────────────────────────────────────────
      if (tAccommodations.length > 0) {
        if (currentY > 230) { doc.addPage(); currentY = 20; }
        sectionLabel('Accommodations', C_SLATE);
        autoTable(doc, {
          startY: currentY,
          head: [['Hotel', 'Address', 'Check-in', 'Check-out']],
          body: tAccommodations.map(acc => [acc.name, acc.address, acc.check_in, acc.check_out]),
          theme: 'plain',
          styles: { font: 'NotoSansTC', fontStyle: 'normal', fontSize: 8.5, cellPadding: 2.5, textColor: '#0f172a' },
          headStyles: { fillColor: C_SLATE, textColor: [255,255,255], fontSize: 7.5 },
          alternateRowStyles: { fillColor: C_SLATE100 },
          columnStyles: { 1: { cellWidth: 65 } },
          margin: { left: 15, right: 15 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      // ── Daily Itinerary ─────────────────────────────────────────────────
      if (currentY > 220) { doc.addPage(); currentY = 20; }
      sectionLabel('Daily Itinerary', C_BLUE);

      const dates = getDateRange();
      dates.forEach((date, i) => {
        const dayActs = tActivities.filter(a => a.date === date && !a.is_flight);
        if (currentY > 255) { doc.addPage(); currentY = 20; }

        // Day pill badge
        const dayLabel = `Day ${i + 1}   ${format(parseISO(date), 'MMM d')}`;
        const pillW = doc.getTextWidth(dayLabel) + 8;
        doc.setFillColor(...C_BLUE);
        doc.roundedRect(15, currentY - 3.5, pillW, 6, 1.5, 1.5, 'F');
        doc.setFont('NotoSansTC', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text(dayLabel, 19, currentY + 1);
        currentY += 7;

        if (dayActs.length === 0) {
          doc.setFontSize(8);
          doc.setTextColor('#94a3b8');
          doc.text('No activities scheduled.', 19, currentY + 3);
          currentY += 10;
        } else {
          autoTable(doc, {
            startY: currentY,
            body: dayActs.map(a => [
              a.start_time,
              a.end_time ? `→ ${a.end_time}` : '',
              a.activity,
              a.note || '',
            ]),
            theme: 'plain',
            styles: {
              font: 'NotoSansTC', fontStyle: 'normal',
              fontSize: 8.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
              valign: 'top',
            },
            alternateRowStyles: { fillColor: C_SLATE100 },
            columnStyles: {
              0: { cellWidth: 14, textColor: [71, 85, 105], halign: 'right' },
              1: { cellWidth: 14, textColor: [148, 163, 184], fontSize: 7.5 },
              2: { cellWidth: 85, textColor: [15, 23, 42] },
              3: { cellWidth: 'auto', textColor: [148, 163, 184], fontSize: 7.5 },
            },
            margin: { left: 15, right: 15 },
          });
          currentY = (doc as any).lastAutoTable.finalY + 6;
        }
      });

      // ── Footer on every page ────────────────────────────────────────────
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        // bottom blue bar
        doc.setFillColor(...C_BLUE);
        doc.rect(0, doc.internal.pageSize.getHeight() - 2.5, pageWidth, 2.5, 'F');
        doc.setFontSize(7);
        doc.setTextColor('#94a3b8');
        doc.text('AI Travel Planner', pageWidth / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' });
        doc.text(`${p} / ${pageCount}`, pageWidth - 15, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
      }

      return doc.output('blob');
    } catch (err) {
      console.error('PDF generation failed:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };


  const handleDownloadPDF = async () => {
    if (!selectedTrip) return;
    setIsGeneratingPdf(true);
    const blob = await generatePdfBlob();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedTrip.name}_行程表.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    }
    setIsGeneratingPdf(false);
    setIsExportModalOpen(false);
  };

  const handleSendEmail = async () => {
    if (!selectedTrip || !exportEmail) return;
    setIsSendingEmail(true);
    const blob = await generatePdfBlob();
    if (!blob) {
      setIsSendingEmail(false);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
      try {
        const res = await fetch('/api/send-itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: exportEmail,
            tripName: selectedTrip.name,
            pdfBase64: base64data.split(',')[1]
          })
        });
        if (res.ok) {
          alert('行程表已成功發送到您的信箱！');
          setIsExportModalOpen(false);
        } else {
          alert('發送失敗，請稍後再試。');
        }
      } catch (err) {
        console.error(err);
        alert('發送失敗，請檢查網路連線。');
      } finally {
        setIsSendingEmail(false);
      }
    };
  };

  useEffect(() => {
    if (!calendarMessage) return;
    const timer = setTimeout(() => setCalendarMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [calendarMessage]);

  const handleExportPDF = async () => {
    setIsExportModalOpen(true);
  };

  /**
   * Push this trip's activities into Google Calendar, as a full mirror.
   *
   * Nothing is marked "confirmed" anywhere: an activity that exists is an
   * activity that belongs on the calendar, an edited one moves its own event,
   * and one deleted here takes its event with it. That is only possible because
   * trip.gcal.events remembers what the last run created — so it is written
   * back below even when nothing was added, and a failed run deliberately
   * writes nothing rather than a partial map that would orphan events.
   */
  const handleSyncCalendar = async () => {
    if (!selectedTrip || isSyncingCalendar) return;
    setIsSyncingCalendar(true);
    setCalendarMessage('');
    try {
      const result = await syncTripToCalendar(selectedTrip, activities);
      const gcal = { events: result.events, syncedAt: new Date().toISOString() };
      await updateDoc(doc(db, "trips", selectedTrip.documentId || selectedTrip.id), { gcal });
      // trips come from fetchTrips()'s getDocs, not a listener, so the local
      // copies have to be moved by hand or the next sync reads a stale map and
      // duplicates every event.
      setSelectedTrip(prev => (prev ? { ...prev, gcal } : prev));
      setTrips(prev => prev.map(t => (t.id === selectedTrip.id ? { ...t, gcal } : t)));
      setCalendarMessage(
        `已連動 Google Calendar：新增 ${result.added}、更新 ${result.updated}、移除 ${result.removed}`,
      );
    } catch (err) {
      // CalendarError already carries a sentence written for the user; anything
      // else is a bug and must not be echoed raw into the UI.
      setCalendarMessage(err instanceof CalendarError ? err.message : '同步失敗，請稍後再試。');
      console.error(err);
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!confirm('確定要刪除此行程嗎？')) return;
    try {
            await deleteDoc(doc(db, "activities", id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAccommodation = async (id: string) => {
    if (!confirm('確定要刪除此住宿資訊嗎？')) return;
    try {
      await deleteDoc(doc(db, "accommodations", id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingActivity || !selectedTrip) return;
    try {
      const activityDoc = doc(db, "activities", editingActivity.id);
      
      // Check if activity name changed
      const originalActivity = activities.find(a => a.id === editingActivity.id);
      const nameChanged = originalActivity && originalActivity.activity !== editingActivity.activity;

      const { id, ...activityData } = editingActivity; // Firestore update doesn't need the id in the body
      await updateDoc(activityDoc, activityData);
      setEditingActivity(null);

      // Regenerate AI advice + photo if name changed and it's not a flight
      if (nameChanged && !editingActivity.is_flight) {
        geminiService.getItineraryAdvice(editingActivity.activity, selectedTrip.country)
          .then(advice => { if (advice) updateDoc(activityDoc, { ai_advice: advice }); })
          .catch(err => console.error("Failed to update AI advice", err));
        geminiService.getActivityPhoto(editingActivity.activity, selectedTrip.country)
          .then(photoUrl => { if (photoUrl) updateDoc(activityDoc, { photo_url: photoUrl }); })
          .catch(err => console.error("Failed to update activity photo", err));
      }
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * Collections whose rows belong to a trip and must go with it.
   *
   * They are joined by a `trip_id` FIELD rather than being subcollections, so
   * deleting the trip document leaves them behind — reachable by nothing,
   * visible in no screen, and counted by no total. Before 2026-09-22 that is
   * exactly what happened on every delete.
   */
  const TRIP_CHILD_COLLECTIONS = ['activities', 'accommodations', 'expenses', 'checklist'] as const;

  /**
   * Delete a trip and everything hanging off it.
   *
   * Children go FIRST and the trip document last. The other order is the one
   * that cannot be recovered from: if the run dies half way, the trip is gone
   * and its remaining rows point at an id that no longer resolves, so nothing
   * in the app can ever find or remove them. This way a failure leaves the
   * trip in the list, short a few rows, and pressing delete again finishes it.
   *
   * The query is on `trip.id`, not the document id: legacy trips carry their
   * own UUID `id` field and their children reference that, which is the same
   * divergence that stops firestore.rules checking ownership on these
   * collections. `trip.id` is already `data.id || doc.id` from fetchTrips, so
   * it is the one value both shapes agree on.
   */
  const handleDeleteTrip = async (e: React.MouseEvent, trip: Trip) => {
    e.stopPropagation();
    if (deletingTripId) return;

    try {
      setDeletingTripId(trip.id);

      // Counted before asking, because 「確定要刪除整趟旅程嗎」 does not tell
      // anyone what they are about to lose.
      const snapshots = await Promise.all(
        TRIP_CHILD_COLLECTIONS.map(name =>
          getDocs(query(collection(db, name), where('trip_id', '==', trip.id))),
        ),
      );
      const labels = ['活動', '住宿', '支出', '清單項目'];
      const parts = snapshots
        .map((snap, i) => (snap.size > 0 ? `${snap.size} 筆${labels[i]}` : ''))
        .filter(Boolean);
      const gcalCount = Object.keys(trip.gcal?.events ?? {}).length;

      const message = [
        `確定要刪除「${trip.name}」嗎？`,
        parts.length > 0 ? `將一併刪除 ${parts.join('、')}。` : '這趟底下沒有其他資料。',
        // The calendar is not ours to clean up here: removing those events
        // needs a Google authorization popup, and springing one on someone
        // mid-delete is worse than telling them it did not happen.
        gcalCount > 0
          ? `
注意：Google Calendar 上那 ${gcalCount} 筆事件不會被移除，要自己去日曆刪。`
          : '',
        `
此動作無法復原。`,
      ]
        .filter(Boolean)
        .join('');

      if (!confirm(message)) return;

      for (const snap of snapshots) {
        // Firestore caps a batch at 500 writes. A 20-day trip stays well under
        // that, but the chunking is what stops the cap turning into a partial
        // delete the day someone imports a long itinerary.
        const docs = snap.docs;
        for (let start = 0; start < docs.length; start += 450) {
          const batch = writeBatch(db);
          for (const d of docs.slice(start, start + 450)) batch.delete(d.ref);
          await batch.commit();
        }
      }

      await deleteDoc(doc(db, "trips", trip.documentId || trip.id));

      fetchTrips();
      if (selectedTrip?.id === trip.id) {
        setSelectedTrip(null);
      }
    } catch (err) {
      console.error(err);
      alert('刪除失敗。這趟旅程還在，可以再試一次。');
    } finally {
      setDeletingTripId(null);
    }
  };

  const handleScanAccommodation = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const res = await geminiService.parseAccommodationInfo('', base64, file.type);
        setAccommodationForm({
          name: res.name || '',
          address: res.address || '',
          check_in: res.check_in || '',
          check_out: res.check_out || ''
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const getDateRange = () => {
    if (!selectedTrip) return [];
    const start = parseISO(selectedTrip.start_date);
    const end = parseISO(selectedTrip.end_date);
    const days = differenceInDays(end, start) + 1;
    return Array.from({ length: days }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
  };

  function Checklist() {
    const [newItem, setNewItem] = useState('');

    const handleAddItem = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newItem.trim() || !selectedTrip) return;
      
            await addDoc(collection(db, "checklist"), {
        trip_id: selectedTrip.id,
        item: newItem.trim(),
        is_checked: false
      });
      setNewItem('');
    };

    const handleToggleCheck = async (id: string, is_checked: boolean) => {
            const itemDoc = doc(db, "checklist", id);
      await updateDoc(itemDoc, { is_checked: !is_checked });
    };

    const handleDeleteItem = async (id: string) => {
            await deleteDoc(doc(db, "checklist", id));
    };

    return (
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
        <form onSubmit={handleAddItem} className="flex gap-2 mb-3">
          <input 
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            className="flex-1 p-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:ring-1 focus:ring-zinc-900 outline-none"
            placeholder="新增準備物品..."
          />
          <button className="px-4 bg-zinc-900 text-white rounded-lg text-sm font-bold">新增</button>
        </form>
        <div className="space-y-2">
          {checklist.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-2 hover:bg-zinc-50 rounded-md">
              <input 
                type="checkbox" 
                checked={!!item.is_checked}
                onChange={() => handleToggleCheck(item.id, !!item.is_checked)}
                className="w-5 h-5 rounded-md border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span className={cn("flex-1 text-sm", item.is_checked && "line-through text-zinc-400")}>
                {item.item}
              </span>
              <button onClick={() => handleDeleteItem(item.id)} className="text-zinc-400 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  function renderTripList() { return (
    <div className="h-full overflow-y-auto">
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center py-4 safe-top">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">我的旅程</h1>
          <p className="text-sm text-zinc-400 mt-1">歡迎回來, {currentUser?.username}</p>
        </div>
        <div className="flex gap-2">
          {currentUser?.role === 'admin' && (
            <button 
              onClick={() => setIsUserManagementOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-zinc-200 text-zinc-600 rounded-xl shadow-sm hover:bg-zinc-50 transition-colors text-sm font-bold"
              title="使用者管理"
            >
              <Users size={18} /> 成員管理
            </button>
          )}
          <button
            onClick={() => setIsImportingItinerary(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-zinc-200 text-zinc-600 rounded-xl shadow-sm hover:bg-zinc-50 transition-colors text-sm font-bold"
            title="從檔案匯入行程"
          >
            <FileUp size={18} /> 匯入行程
          </button>
          <button 
            onClick={() => setIsAddingTrip(true)}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-900 text-white rounded-xl shadow-sm hover:bg-zinc-800 transition-colors text-sm font-bold"
          >
            <Plus size={18} /> 新增旅程
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 bg-white border border-zinc-200 text-zinc-400 rounded-xl shadow-sm hover:text-red-500 transition-colors"
            title="登出"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      
      <div className="grid gap-4">
        {trips.map(trip => {
          const theme = getCountryTheme(trip.country);
          const status = getTripStatus(trip.start_date, trip.end_date);
          return (
          <motion.div
            key={trip.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTrip(trip)}
            className="relative overflow-hidden p-5 rounded-2xl border shadow-sm flex items-center justify-between cursor-pointer transition-all hover:shadow-md"
            style={{ background: theme.gradient, borderColor: theme.borderColor }}
          >
            {/* Landmark SVG decoration */}
            <div className="absolute right-0 bottom-0 pointer-events-none select-none">
              {theme.landmark}
            </div>

            {/* Content */}
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-zinc-900">{trip.name}</h3>
                {currentUser?.role === 'admin' && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTripToManage(trip);
                        setIsManagingBuddies(true);
                      }}
                      className="p-1.5 text-zinc-300 hover:text-blue-500 transition-colors"
                      title="管理旅伴"
                    >
                      <Users size={14} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteTrip(e, trip)}
                      disabled={deletingTripId !== null}
                      className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors disabled:opacity-40"
                      title="刪除旅程"
                    >
                      {deletingTripId === trip.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm text-zinc-500 mt-1 flex items-center gap-1">
                <Calendar size={14} className="text-zinc-400" /> {trip.start_date} ~ {trip.end_date}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="px-2 py-0.5 bg-white/70 text-zinc-700 text-[10px] font-bold rounded-full border border-white/80 tracking-wide">
                  {theme.flagEmoji} {trip.country}
                </span>
                <span className="px-2 py-0.5 bg-white/70 text-zinc-500 text-[10px] font-medium rounded-full border border-white/80">
                  {getTripNights(trip.start_date, trip.end_date)}
                </span>
                <span className={`px-2 py-0.5 bg-white/70 text-[10px] font-medium rounded-full border border-white/80 ${status.color}`}>
                  {status.label}
                </span>
                {trip.owner_id !== currentUser?.id && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full border border-blue-100">
                    受邀行程
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="relative z-10 flex-shrink-0 text-zinc-300" size={20} />
          </motion.div>
          );
        })}
        {trips.length === 0 && (
          <div className="text-center py-20 text-zinc-400">
            <p className="font-medium">尚未建立任何旅程</p>
            <p className="text-sm">點擊右上角按鈕開始規劃吧！</p>
          </div>
        )}
      </div>
    </div>
    </div>
  ); }

  function renderTripDetail() {
    if (!selectedTrip) return null;
    const dates = getDateRange();
    const currentActivities = activities
      .filter(a => a.date === activeTab)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    const isOverview = activeTab === OVERVIEW_TAB;
    // parseISO(OVERVIEW_TAB) is an Invalid Date and every comparison against
    // it is false, so this would quietly return [] anyway — but only by
    // accident. The guard says so out loud.
    const currentAccommodations = isOverview ? [] : accommodations.filter(acc => {
      const checkIn = parseISO(acc.check_in);
      const checkOut = parseISO(acc.check_out);
      const current = parseISO(activeTab);
      // "From the day after check-in" -> current > checkIn
      return current > checkIn && current <= checkOut;
    });
    const totalExpenseTWD = expenses.reduce((sum, e) => {
      const rate = EXCHANGE_RATES[e.currency] || 1;
      return sum + (e.amount * rate);
    }, 0);

    return (
      <div className="flex flex-col h-screen bg-zinc-50">
        {/* Header */}
        <div className="bg-white border-b border-zinc-200 sticky top-0 z-10 shadow-sm safe-top">
          {/* ── Collapsible top row ── */}
          <AnimatePresence initial={false}>
            {!headerCollapsed && (
              <motion.div
                key="header-top"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedTrip(null)} className="p-1.5 hover:bg-zinc-100 rounded-full transition-colors text-zinc-600">
                      <ArrowLeft size={18} />
                    </button>
                    <div>
                      <h2 className="text-base font-bold text-zinc-900 leading-tight">{selectedTrip.name}</h2>
                      <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{selectedTrip.country}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setIsAddingFlight(true)} className="p-1.5 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors" title="新增航班">
                      <Plane size={16} />
                    </button>
                    <button onClick={() => setIsAddingAccommodation(true)} className="p-1.5 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors" title="新增住宿">
                      <Hotel size={16} />
                    </button>
                    <button
                      onClick={handleExportPDF}
                      disabled={isGeneratingPdf}
                      className="p-1.5 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
                      title="匯出 PDF"
                    >
                      {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    </button>
                    <button
                      onClick={handleSyncCalendar}
                      disabled={isSyncingCalendar}
                      className="p-1.5 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
                      title={
                        selectedTrip.gcal?.syncedAt
                          ? `連動 Google Calendar（上次同步 ${format(parseISO(selectedTrip.gcal.syncedAt), 'MM/dd HH:mm')}）`
                          : '連動 Google Calendar'
                      }
                    >
                      {isSyncingCalendar ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
                    </button>
                    <button
                      onClick={() => { showTotalExpense ? setIsExpenseAnalysisOpen(true) : setShowTotalExpense(true); }}
                      className="bg-zinc-900 text-white px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all text-right"
                    >
                      <div className="text-[8px] uppercase font-bold opacity-60 leading-tight">總支出</div>
                      <div className="text-xs font-bold leading-tight">
                        {showTotalExpense ? `$${Math.round(totalExpenseTWD).toLocaleString()}` : '查看'}
                      </div>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Compact bar when collapsed ── */}
          {headerCollapsed && (
            <div className="flex items-center gap-2 px-3 py-2">
              <button onClick={() => setSelectedTrip(null)} className="p-1 hover:bg-zinc-100 rounded-full transition-colors text-zinc-500">
                <ArrowLeft size={16} />
              </button>
              <span className="text-sm font-bold text-zinc-700 flex-1 truncate">{selectedTrip.name}</span>
              <button
                onClick={() => { showTotalExpense ? setIsExpenseAnalysisOpen(true) : setShowTotalExpense(true); }}
                className="text-[10px] font-bold text-zinc-500 bg-zinc-100 px-2 py-1 rounded-lg"
              >
                {showTotalExpense ? `$${Math.round(totalExpenseTWD).toLocaleString()} TWD` : '查看支出'}
              </button>
            </div>
          )}

          {/* Date Tabs */}
          <div className="flex gap-2 overflow-x-auto px-4 pb-2.5 no-scrollbar">
            <button
              onClick={() => setActiveTab(OVERVIEW_TAB)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border flex-shrink-0 flex items-center gap-1.5",
                activeTab === OVERVIEW_TAB
                  ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
                  : "bg-white text-zinc-500 border-zinc-200"
              )}
            >
              <LayoutGrid size={11} /> 總覽
            </button>
            {/* The divider keeps 總覽 from reading as "Day 0" — it is a
                different kind of thing, not the day before the first one. */}
            <div className="w-px bg-zinc-200 my-1 flex-shrink-0" />
            {dates.map((date, i) => (
              <button
                key={date}
                onClick={() => setActiveTab(date)}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border flex-shrink-0",
                  activeTab === date
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
                    : "bg-white text-zinc-500 border-zinc-200"
                )}
              >
                Day {i + 1} <span className="font-normal opacity-60 ml-1 text-[10px]">({format(parseISO(date), 'M/d')})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4 pb-32 max-w-2xl mx-auto w-full"
          onScroll={e => setHeaderCollapsed(e.currentTarget.scrollTop > 55)}
        >

          {isOverview ? (
            <TripOverview
              trip={selectedTrip}
              dates={dates}
              activities={activities}
              accommodations={accommodations}
              expenses={expenses}
              checklist={checklist}
              ideas={ideas}
              currentUser={currentUser}
              onJumpToDay={setActiveTab}
              onOpenExpenses={() => { setShowTotalExpense(true); setIsExpenseAnalysisOpen(true); }}
              onAddAccommodation={() => setIsAddingAccommodation(true)}
              onAddFlight={() => setIsAddingFlight(true)}
            />
          ) : (
          <>

          {/* ── Per-day: Hotel check-in / check-out ── */}
          {(() => {
            const checkIns  = accommodations.filter(a => a.check_in  === activeTab);
            const checkOuts = accommodations.filter(a => a.check_out === activeTab);
            if (checkIns.length === 0 && checkOuts.length === 0) return null;
            return (
              <div className="space-y-2">
                {checkIns.map(acc => (
                  <div key={`ci-${acc.id}`} className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-2xl flex items-center gap-3 group">
                    <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Hotel size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-0.5">🔑 今日入住</div>
                      <div className="text-sm font-bold text-zinc-900 truncate">{acc.name}</div>
                      <div className="text-[10px] text-zinc-400">{acc.check_in} → {acc.check_out}</div>
                    </div>
                    {acc.map_url && (
                      <a href={acc.map_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="text-xs font-bold text-emerald-500 hover:underline flex items-center gap-1 flex-shrink-0">
                        <MapPin size={11} /> 地圖
                      </a>
                    )}
                    <button onClick={() => handleDeleteAccommodation(acc.id)}
                      className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {checkOuts.map(acc => (
                  <div key={`co-${acc.id}`} className="bg-amber-50/50 border border-amber-100 p-3 rounded-2xl flex items-center gap-3 group">
                    <div className="w-9 h-9 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Hotel size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-0.5">🧳 今日退房</div>
                      <div className="text-sm font-bold text-zinc-900 truncate">{acc.name}</div>
                      <div className="text-[10px] text-zinc-400">{acc.check_in} → {acc.check_out}</div>
                    </div>
                    {acc.map_url && (
                      <a href={acc.map_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="text-xs font-bold text-amber-500 hover:underline flex items-center gap-1 flex-shrink-0">
                        <MapPin size={11} /> 地圖
                      </a>
                    )}
                    <button onClick={() => handleDeleteAccommodation(acc.id)}
                      className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Checklist: Day 1 only ── */}
          {activeTab === dates[0] && (
            <div className="space-y-2">
              <button onClick={() => setIsChecklistExpanded(!isChecklistExpanded)}
                className="flex items-center gap-2 text-sm font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors w-full">
                準備清單
                <MoreHorizontal size={14} className={cn("transition-transform", isChecklistExpanded ? "rotate-90" : "rotate-0")} />
              </button>
              <AnimatePresence>
                {isChecklistExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <Checklist />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── Itinerary Section ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">今日行程</h3>
              <button
                onClick={() => { setDailyNeedOpen(o => !o); setDailyNeedSuggestion(s => ({ ...s, [activeTab]: '' })); }}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors",
                  dailyNeedOpen
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-amber-200 hover:text-amber-600"
                )}
              >
                <Sparkles size={11} /> 今日需求
              </button>
            </div>

            {/* ── AI Daily Need Input ── */}
            <AnimatePresence>
              {dailyNeedOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-gradient-to-br from-amber-50 to-stone-50 border border-amber-100 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={13} className="text-amber-500" />
                      <span className="text-xs font-bold text-amber-700">告訴 AI 你今天的需求</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={dailyNeedInput}
                        onChange={e => setDailyNeedInput(e.target.value)}
                        onKeyDown={async e => {
                          if (e.key === 'Enter' && dailyNeedInput.trim() && !dailyNeedLoading) {
                            e.preventDefault();
                            if (!selectedTrip) return;
                            setDailyNeedLoading(true);
                            try {
                              const result = await geminiService.getDailyNeedSuggestion(
                                dailyNeedInput.trim(),
                                currentActivities.map(a => ({ start_time: a.start_time, end_time: a.end_time, activity: a.activity })),
                                selectedTrip.country,
                                activeTab,
                              );
                              setDailyNeedSuggestion(s => ({ ...s, [activeTab]: result }));
                            } catch { /* silent */ }
                            setDailyNeedLoading(false);
                          }
                        }}
                        placeholder="例：想買抹茶、找藥妝店、喝一杯精品咖啡..."
                        className="flex-1 text-sm px-3 py-2 bg-white border border-amber-100 rounded-xl focus:border-amber-300 outline-none placeholder:text-stone-300"
                      />
                      <button
                        disabled={!dailyNeedInput.trim() || dailyNeedLoading}
                        onClick={async () => {
                          if (!selectedTrip || !dailyNeedInput.trim()) return;
                          setDailyNeedLoading(true);
                          try {
                            const result = await geminiService.getDailyNeedSuggestion(
                              dailyNeedInput.trim(),
                              currentActivities.map(a => ({ start_time: a.start_time, end_time: a.end_time, activity: a.activity })),
                              selectedTrip.country,
                              activeTab,
                            );
                            setDailyNeedSuggestion(s => ({ ...s, [activeTab]: result }));
                          } catch { /* silent */ }
                          setDailyNeedLoading(false);
                        }}
                        className="px-3 py-2 bg-amber-500 text-white rounded-xl font-bold text-xs disabled:opacity-40 hover:bg-amber-600 transition-colors flex items-center gap-1.5 flex-shrink-0"
                      >
                        {dailyNeedLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        {dailyNeedLoading ? '思考中' : '取得建議'}
                      </button>
                    </div>

                    {/* Suggestion result */}
                    {dailyNeedSuggestion[activeTab] && (() => {
                      try {
                        const s = JSON.parse(dailyNeedSuggestion[activeTab]);
                        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.mapQuery || s.place)}`;
                        return (
                          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-xl border border-amber-100 p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-zinc-900 leading-snug">{s.place}</div>
                                {s.area && <div className="text-[10px] text-stone-400 mt-0.5 flex items-center gap-1"><MapPin size={9}/>{s.area}</div>}
                              </div>
                              {s.suggestedTime && (
                                <span className="text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">
                                  🕐 {s.suggestedTime}
                                </span>
                              )}
                            </div>
                            {s.reason && <p className="text-[11px] text-stone-500 leading-relaxed">{s.reason}</p>}
                            <div className="flex gap-2 pt-1">
                              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline">
                                <MapPin size={11} /> 查看地圖
                              </a>
                              <button
                                onClick={async () => {
                                  if (!selectedTrip) return;
                                  const newActivity = {
                                    trip_id: selectedTrip.id,
                                    date: activeTab,
                                    start_time: s.suggestedTime || '12:00',
                                    end_time: '',
                                    activity: s.place,
                                    map_url: mapsUrl,
                                    note: s.reason || '',
                                    is_flight: false,
                                    travel_mode: 'transit' as const,
                                    ai_advice: '',
                                    photo_url: '',
                                    travel_time_to_next: '',
                                  };
                                  const docRef = await addDoc(collection(db, 'activities'), newActivity);
                                  // Async enrich with photo + advice
                                  geminiService.getItineraryAdvice(s.place, selectedTrip.country)
                                    .then(advice => { if (advice) updateDoc(docRef, { ai_advice: advice }); }).catch(() => {});
                                  geminiService.getActivityPhoto(s.place, selectedTrip.country)
                                    .then(photoUrl => { if (photoUrl) updateDoc(docRef, { photo_url: photoUrl }); }).catch(() => {});
                                  setDailyNeedOpen(false);
                                  setDailyNeedInput('');
                                  setDailyNeedSuggestion(s2 => ({ ...s2, [activeTab]: '' }));
                                }}
                                className="flex items-center gap-1 text-xs font-bold text-white bg-zinc-900 px-2.5 py-1 rounded-lg hover:bg-zinc-700 transition-colors"
                              >
                                <Plus size={11} /> 加入今日行程
                              </button>
                            </div>
                          </motion.div>
                        );
                      } catch {
                        return <p className="text-xs text-stone-500 italic">{dailyNeedSuggestion[activeTab]}</p>;
                      }
                    })()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Staying hotel as start point */}
            {currentAccommodations.map(acc => (
              <div key={`start-${acc.id}`} className="bg-zinc-100/50 p-3 rounded-2xl border border-zinc-200 border-dashed flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-white text-zinc-400 rounded-lg flex items-center justify-center border border-zinc-100">
                  <Hotel size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-zinc-500">從 {acc.name} 出發</div>
                  <div className="text-[9px] font-medium text-zinc-400">{acc.address}</div>
                </div>
              </div>
            ))}

            {currentActivities.length === 0 && currentAccommodations.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-zinc-100 border-dashed">
                <p className="text-sm text-zinc-400">這天還沒有行程喔！</p>
              </div>
            ) : (
              /* ── Timeline ── */
              <div>
                {currentActivities.map((activity, idx) => {
                  const isLast = idx === currentActivities.length - 1;
                  const next = currentActivities[idx + 1];

                  // Flight card helpers
                  const allFlightsSorted = activities
                    .filter(a => a.is_flight)
                    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
                  const flightGlobalIdx = allFlightsSorted.findIndex(f => f.id === activity.id);
                  const isOutbound = flightGlobalIdx < Math.ceil(allFlightsSorted.length / 2);
                  const flightParsed = activity.is_flight ? parseFlightActivity(activity.activity) : null;
                  const flightDuration = activity.is_flight ? calcFlightDuration(activity.start_time, activity.end_time) : null;
                  const depCode = flightParsed ? getAirportCode(flightParsed.departure) : '???';
                  const arrCode = flightParsed ? getAirportCode(flightParsed.arrival) : '???';
                  const depLabel = flightParsed?.departure.split(' ').slice(0, 2).join(' ') || '';
                  const arrLabel = flightParsed?.arrival.split(' ').slice(0, 2).join(' ') || '';

                  // Transport connector helpers
                  const modeIcon = next?.travel_mode === 'walking' ? '🚶' : next?.travel_mode === 'driving' ? '🚕' : '🚇';
                  const gmMode = next?.travel_mode === 'walking' ? 'walking' : next?.travel_mode === 'driving' ? 'driving' : 'transit';
                  const mapsUrl = next
                    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(activity.activity + ', ' + selectedTrip!.country)}&destination=${encodeURIComponent(next.activity + ', ' + selectedTrip!.country)}&travelmode=${gmMode}`
                    : '';

                  // AI advice renderer (shared)
                  const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
                    restaurant: { icon: '🍽', label: '餐廳', color: 'text-rose-600 bg-rose-50 border-rose-100' },
                    cafe:       { icon: '☕', label: '咖啡廳', color: 'text-amber-700 bg-amber-50 border-amber-200' },
                    landmark:   { icon: '🏛', label: '景點', color: 'text-blue-600 bg-blue-50 border-blue-100' },
                    shopping:   { icon: '🛍', label: '購物', color: 'text-purple-600 bg-purple-50 border-purple-100' },
                    other:      { icon: '✨', label: '其他', color: 'text-stone-600 bg-stone-100 border-stone-200' },
                  };
                  const renderAiAdvice = () => {
                    if (!activity.ai_advice) return null;
                    try {
                      const p = JSON.parse(activity.ai_advice);
                      const meta = TYPE_META[p.type] || TYPE_META.other;
                      return (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3 p-3 bg-amber-50/60 rounded-xl text-[11px] border border-amber-100">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Sparkles size={10} className="text-amber-500" />
                            <span className="text-amber-700 font-bold text-[10px] uppercase tracking-wide">AI 建議</span>
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border", meta.color)}>{meta.icon} {meta.label}</span>
                          </div>
                          {p.headline && <p className="font-bold text-stone-700 mb-1.5">{p.headline}</p>}
                          {Array.isArray(p.tips) && p.tips.length > 0 && (
                            <ul className="space-y-0.5">
                              {p.tips.map((tip: string, i: number) => (
                                <li key={i} className="flex gap-1.5 text-stone-600">
                                  <span className="text-amber-400 mt-0.5 flex-shrink-0">•</span><span>{tip}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </motion.div>
                      );
                    } catch {
                      return (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3 p-3 bg-amber-50/60 rounded-xl text-[11px] text-stone-600 border border-amber-100 italic">
                          <div className="flex items-center gap-1 mb-1 text-amber-600 font-bold not-italic">
                            <Sparkles size={10} /> AI 建議
                          </div>
                          {activity.ai_advice}
                        </motion.div>
                      );
                    }
                  };

                  return (
                    <div key={activity.id} className="flex gap-0">
                      {/* ── Left: time label + dot + line ── */}
                      <div className="w-14 flex-shrink-0 flex flex-col items-end">
                        <span className="text-[10px] font-bold text-stone-400 pr-2.5 mt-3.5 leading-none tabular-nums">
                          {activity.start_time}
                        </span>
                        <div className="flex flex-col items-center flex-1 pr-2 mt-1">
                          <div className={cn(
                            "w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm flex-shrink-0",
                            activity.is_flight ? "bg-blue-400" : "bg-amber-400"
                          )} />
                          {!isLast && <div className="w-px flex-1 bg-stone-200 mt-1 min-h-[16px]" />}
                        </div>
                      </div>

                      {/* ── Right: card + transport connector ── */}
                      <div className="flex-1 min-w-0 pb-4 pl-2">
                        {activity.is_flight ? (
                          /* ── Fancy flight card ── */
                          <motion.div
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            onClick={() => setEditingActivity(activity)}
                            className={cn(
                              "rounded-2xl border p-4 cursor-pointer transition-all group relative overflow-hidden",
                              isOutbound
                                ? "bg-blue-50/40 border-blue-100 hover:border-blue-200"
                                : "bg-violet-50/40 border-violet-100 hover:border-violet-200"
                            )}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", isOutbound ? "bg-blue-100 text-blue-600" : "bg-violet-100 text-violet-600")}>
                                {isOutbound ? '✈ 去程' : '✈ 回程'}
                              </span>
                              <span className="text-xs font-black text-zinc-700 tracking-widest">{flightParsed?.flightNo ?? activity.activity.slice(0, 10)}</span>
                              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", isOutbound ? "bg-blue-100 text-blue-600" : "bg-violet-100 text-violet-600")}>
                                ⏱ {flightDuration}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mb-3">
                              <div className="text-center w-14 flex-shrink-0">
                                <div className={cn("text-2xl font-black tracking-tight leading-none", isOutbound ? "text-blue-700" : "text-violet-700")}>{depCode}</div>
                                <div className="text-[9px] text-zinc-400 mt-0.5 leading-tight">{depLabel}</div>
                              </div>
                              <div className="flex-1 flex items-center gap-1 min-w-0">
                                <span className="text-base">🛫</span>
                                <div className={cn("flex-1 border-t-2 border-dashed", isOutbound ? "border-blue-200" : "border-violet-200")} />
                                <Plane size={13} className={cn("flex-shrink-0", isOutbound ? "text-blue-400" : "text-violet-400")} />
                                <div className={cn("flex-1 border-t-2 border-dashed", isOutbound ? "border-blue-200" : "border-violet-200")} />
                                <span className="text-base">🛬</span>
                              </div>
                              <div className="text-center w-14 flex-shrink-0">
                                <div className={cn("text-2xl font-black tracking-tight leading-none", isOutbound ? "text-blue-700" : "text-violet-700")}>{arrCode}</div>
                                <div className="text-[9px] text-zinc-400 mt-0.5 leading-tight">{arrLabel}</div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-zinc-800">{activity.start_time}</span>
                              <span className="text-[10px] text-zinc-400 font-medium">{activity.date}</span>
                              <span className="text-sm font-bold text-zinc-800">{activity.end_time}</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteActivity(activity.id); }}
                              className="absolute top-3 right-3 p-1.5 text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                              <X size={14} />
                            </button>
                          </motion.div>
                        ) : (
                          /* ── Normal activity card ── */
                          <motion.div
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            onClick={() => setEditingActivity(activity)}
                            className="rounded-2xl border shadow-sm relative group cursor-pointer transition-colors overflow-hidden bg-stone-50 border-stone-200 hover:border-amber-300"
                          >
                            {/* Place photo */}
                            {activity.photo_url && (
                              <div key={activity.photo_url} className="h-36 w-full overflow-hidden">
                                <img src={activity.photo_url} alt={activity.activity}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  onLoad={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = ''; }}
                                  onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                                />
                              </div>
                            )}
                            <div className="p-3.5">
                              <div className="flex justify-between items-start mb-1.5">
                                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                                  <h4 className="text-sm font-bold text-zinc-900 leading-snug">{activity.activity}</h4>
                                  {activity.end_time && (
                                    <span className="text-[10px] text-stone-400 font-medium flex-shrink-0">～ {activity.end_time}</span>
                                  )}
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteActivity(activity.id); }}
                                  className="p-1.5 text-stone-300 hover:text-red-500 transition-colors flex-shrink-0 ml-1">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              {activity.note && (
                                <p className="text-xs text-stone-500 mb-2.5 leading-relaxed">{activity.note}</p>
                              )}
                              {activity.map_url && (
                                <div className="flex justify-end">
                                  <a href={activity.map_url} target="_blank" rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline">
                                    <MapPin size={11} /> 查看地圖
                                  </a>
                                </div>
                              )}
                              {renderAiAdvice()}
                            </div>
                          </motion.div>
                        )}

                        {/* Transport connector */}
                        {!isLast && next && (
                          <div className="py-1.5 pl-1">
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 text-xs text-stone-400 bg-stone-50 px-3 py-1 rounded-full border border-stone-100 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors">
                              <span>{modeIcon}</span>
                              <span>{activity.travel_time_to_next ?? <span className="animate-pulse">計算中...</span>}</span>
                              <MapPin size={10} className="opacity-50" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          </>
          )}
        </div>

        {/* ── FAB ── */}
        <div className="fixed right-5 z-20 flex flex-col items-end gap-2.5" style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
          <AnimatePresence>
            {fabOpen && (
              <>
                {/* backdrop */}
                <motion.div
                  key="backdrop"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[-1]"
                  onClick={() => setFabOpen(false)}
                />
                <motion.button
                  key="expense"
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  transition={{ delay: 0.04 }}
                  onClick={() => { setIsAddingExpense(true); setFabOpen(false); }}
                  className="flex items-center gap-2 bg-white text-zinc-800 px-4 py-2.5 rounded-2xl shadow-lg border border-zinc-200 font-bold text-sm active:scale-95 whitespace-nowrap"
                >
                  <Wallet size={15} /> 新增記帳
                </motion.button>
                <motion.button
                  key="activity"
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  onClick={() => { setIsAddingActivity(true); setFabOpen(false); }}
                  className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2.5 rounded-2xl shadow-lg font-bold text-sm active:scale-95 whitespace-nowrap"
                >
                  <Plus size={15} /> 新增行程
                </motion.button>
              </>
            )}
          </AnimatePresence>
          <button
            onClick={() => setFabOpen(o => !o)}
            className={cn(
              "w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-95",
              fabOpen ? "bg-zinc-200 text-zinc-600" : "bg-zinc-900 text-white"
            )}
          >
            <motion.div animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
              <Plus size={26} />
            </motion.div>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen overflow-hidden bg-zinc-50 font-sans text-zinc-900">
      <AnimatePresence mode="wait">
        {!selectedTrip ? (
          /* h-full is load-bearing, not styling. The list inside is
              `h-full overflow-y-auto`, and height:100% resolves against the
              PARENT's height — with this wrapper left at auto it resolved to
              auto too, so the list grew past the viewport and the
              `overflow-hidden` above simply clipped it. Nothing scrolled and
              the trips below the fold were unreachable. */
          <motion.div 
            key="list"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {renderTripList()}
          </motion.div>
        ) : (
          <motion.div 
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {renderTripDetail()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {isAddingTrip && (
          <Modal title="建立新旅程" onClose={() => setIsAddingTrip(false)}>
            <form onSubmit={handleCreateTrip} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">旅程名稱</label>
                <input name="name" required className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 outline-none" placeholder="例如：東京 2025" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">開始日期</label>
                  <input name="start_date" type="date" required className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">結束日期</label>
                  <input name="end_date" type="date" required className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">國家</label>
                <DestinationPicker name="country" value={newTripCountry} onChange={setNewTripCountry} />
              </div>
              {currentUser?.role === 'admin' && allUsers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">指派旅伴 (可多選)</label>
                  <div className="max-h-32 overflow-y-auto p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
                    {allUsers.filter(u => u.id !== currentUser.id).map(user => (
                      <label key={user.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="shared_with" value={user.id} className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900" />
                        {user.username}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <button type="submit" className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold shadow-lg">確認建立</button>
            </form>
          </Modal>
        )}

        {isImportingItinerary && (
          <ImportItineraryModal
            onClose={() => setIsImportingItinerary(false)}
            onConfirm={handleImportItinerary}
          />
        )}

        {isLoginOpen && (
          <div className="fixed inset-0 bg-zinc-50 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white p-8 rounded-3xl shadow-xl border border-zinc-200 w-full max-w-md"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={32} />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900">旅程規劃助手</h2>
                <p className="text-sm text-zinc-400 mt-2">請登入以開始規劃您的旅程</p>
              </div>

              <div className="space-y-4">
                {loginError && <p className="text-xs text-red-500 font-bold text-center">{loginError}</p>}
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full py-4 bg-white border border-zinc-200 text-zinc-800 rounded-xl font-bold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loading
                    ? <Loader2 size={18} className="animate-spin" />
                    : <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.6h11.9c-.2 2-1.5 5-4.4 7l6.7 5.2c4-3.7 6.9-9.1 6.9-15.8z"/><path fill="#34A853" d="M24 46c6 0 11.1-2 14.8-5.4l-6.7-5.2c-1.9 1.3-4.5 2.2-8.1 2.2-6.2 0-11.5-4.1-13.4-9.8l-7 5.4C7.3 40.8 15 46 24 46z"/><path fill="#FBBC05" d="M10.6 27.8c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7-5.4C2.6 16.5 2 20.1 2 23.3s.6 6.8 1.6 9.9l7-5.4z"/><path fill="#EA4335" d="M24 9.8c4.4 0 7.3 1.9 9 3.5l6.1-6C35.3 3.8 30 1.5 24 1.5 15 1.5 7.3 6.7 3.6 13.4l7 5.4C12.5 13.9 17.8 9.8 24 9.8z"/></svg>}
                  使用 Google 登入
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 text-center mt-6">
                第一次登入會自動建立帳號。行程的讀寫權限由 Firestore 規則依你的
                Google 帳號判定，所以登入是必要的，不只是為了記住你是誰。
              </p>
            </motion.div>
          </div>
        )}

        {/* AI Chat Button */}

        {isUserManagementOpen && (
          <Modal title="使用者管理" onClose={() => setIsUserManagementOpen(false)}>
            <div className="space-y-6">
              <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-50 border border-zinc-100 rounded-xl p-3">
                成員無法從這裡新增 —— 每個人自己用 Google 登入一次就會出現在下面的清單裡，
                之後才能被加進行程的旅伴。權限一律是「user」，要升成 admin 只能在 Firebase
                console 改，這是規則本身擋的，不是介面沒做。
              </p>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">現有使用者</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {allUsers.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-100 rounded-xl">
                      <div>
                        <div className="text-sm font-bold text-zinc-800">{user.username}</div>
                        <div className="text-[10px] text-zinc-400">{user.email || '—'} · 權限：{user.role}</div>
                      </div>
                      {user.role !== 'admin' && (
                        <button onClick={() => handleDeleteUser(user.id)} className="p-2 text-zinc-300 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Modal>
        )}

        {isManagingBuddies && tripToManage && (
          <Modal title={`管理旅伴: ${tripToManage.name}`} onClose={() => {
            setIsManagingBuddies(false);
            setTripToManage(null);
          }}>
            <form onSubmit={handleUpdateBuddies} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-3">選擇要加入此旅程的成員</label>
                <div className="max-h-60 overflow-y-auto p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                  {allUsers.filter(u => u.id !== currentUser?.id).map(user => (
                    <label key={user.id} className="flex items-center justify-between p-2 hover:bg-white rounded-lg transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-zinc-200 rounded-full flex items-center justify-center text-xs font-bold text-zinc-500">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-zinc-700">{user.username}</span>
                      </div>
                      <input 
                        type="checkbox" 
                        name="shared_with" 
                        value={user.id} 
                        defaultChecked={tripToManage.shared_with?.includes(user.id)}
                        className="w-5 h-5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900" 
                      />
                    </label>
                  ))}
                  {allUsers.length <= 1 && (
                    <p className="text-center py-4 text-xs text-zinc-400">尚無其他使用者可供指派</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsManagingBuddies(false)}
                  className="flex-1 py-3 bg-zinc-100 text-zinc-600 rounded-xl font-bold"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] py-3 bg-zinc-900 text-white rounded-xl font-bold shadow-lg"
                >
                  儲存變更
                </button>
              </div>
            </form>
          </Modal>
        )}

        {isAddingActivity && (
          <Modal title="新增行程" onClose={() => {
            setIsAddingActivity(false);
            setShowAiActivityInput(false);
            setAiActivityText('');
          }}>
            <div className="mb-6">
              <div className="flex gap-2 mb-4">
                <button 
                  onClick={() => setShowAiActivityInput(!showAiActivityInput)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-50 text-zinc-600 rounded-xl font-bold border border-zinc-200 hover:bg-zinc-100 transition-colors"
                >
                  <Sparkles size={18} className="text-purple-500" /> AI 智慧匯入 (文字)
                </button>
                <label className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-50 text-zinc-600 rounded-xl font-bold border border-zinc-200 cursor-pointer hover:bg-zinc-100 transition-colors">
                  <Camera size={18} className="text-blue-500" /> 拍照匯入
                  <input type="file" className="hidden" accept="image/*" onChange={handleScanActivity} />
                </label>
              </div>

              {showAiActivityInput && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 p-4 bg-zinc-50 rounded-xl border border-zinc-200 mb-4">
                  <textarea 
                    autoFocus
                    className="w-full p-3 rounded-lg border border-zinc-200 focus:border-zinc-400 outline-none text-sm min-h-[100px]"
                    placeholder="請貼上訂位確認信、行程文字或任何旅遊資訊..."
                    value={aiActivityText}
                    onChange={(e) => setAiActivityText(e.target.value)}
                  />
                  <button 
                    onClick={handleAiActivityTextSubmit}
                    disabled={loading || !aiActivityText.trim()}
                    className="w-full py-2 bg-zinc-900 text-white rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    開始解析
                  </button>
                </motion.div>
              )}
            </div>

            <form name="activityForm" onSubmit={handleAddActivity} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">日期</label>
                <select name="date" defaultValue={getDateRange().includes(activeTab) ? activeTab : getDateRange()[0]} className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                  {getDateRange().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">開始時間</label>
                  <select
                    name="start_time"
                    required
                    value={activityStartTime}
                    onChange={e => handleStartTimeChange(e.target.value)}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl"
                  >
                    {generateTimeSlots().map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">結束時間 (預設+2小時)</label>
                  <select
                    name="end_time"
                    required
                    value={activityEndTime}
                    onChange={e => setActivityEndTime(e.target.value)}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl"
                  >
                    {generateTimeSlots().map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">活動名稱</label>
                <input name="activity" className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" placeholder="例如：淺草寺 (若留空將嘗試從地圖連結自動填入)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Google Maps 連結 (選填)</label>
                <input name="map_url" className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" placeholder="https://maps.google.com/..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">交通方式 (前往此地)</label>
                <select name="travel_mode" className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                  <option value="transit">大眾運輸</option>
                  <option value="walking">步行</option>
                  <option value="driving">駕車</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">備註</label>
                <textarea name="note" className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl h-20" placeholder="想吃什麼、看什麼..." />
              </div>
              <button type="submit" className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold shadow-lg">加入行程</button>
            </form>
          </Modal>
        )}

        {isAddingFlight && (
          <Modal title="新增航班" onClose={() => {
            setIsAddingFlight(false);
            setFlightForm({ flightNo: '', departureAirport: '', arrivalAirport: '', departureTime: '', arrivalTime: '', date: '', departureTimeZone: '', arrivalTimeZone: '' });
            setShowAiInput(false);
            setAiInputText('');
          }}>
            <div className="mb-6">
              <div className="flex gap-2 mb-4">
                <button 
                  onClick={() => setShowAiInput(!showAiInput)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-50 text-zinc-600 rounded-xl font-bold border border-zinc-200"
                >
                  <Sparkles size={18} /> 文字填入
                </button>
                <label className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-50 text-zinc-600 rounded-xl font-bold border border-zinc-200 cursor-pointer">
                  <Camera size={18} /> 拍照填入
                  <input type="file" className="hidden" accept="image/*" onChange={handleScanFlight} />
                </label>
              </div>

              {showAiInput && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 p-4 bg-zinc-50 rounded-xl border border-zinc-200 mb-4">
                  <textarea 
                    autoFocus
                    className="w-full p-3 rounded-lg border border-zinc-200 focus:border-zinc-400 outline-none text-sm min-h-[100px]"
                    placeholder="請貼上航班資訊文字..."
                    value={aiInputText}
                    onChange={(e) => setAiInputText(e.target.value)}
                  />
                  <button 
                    onClick={async () => {
                      if (!aiInputText) return;
                      setLoading(true);
                      try {
                        const res = await geminiService.parseFlightInfo(aiInputText);
                        setFlightForm({
                          flightNo: res.flightNo || '',
                          departureAirport: res.departureAirport || '',
                          arrivalAirport: res.arrivalAirport || '',
                          departureTimeZone: isValidTimeZone(res.departureTimeZone) ? res.departureTimeZone : '',
                          arrivalTimeZone: isValidTimeZone(res.arrivalTimeZone) ? res.arrivalTimeZone : '',
                          departureTime: res.departureTime || '',
                          arrivalTime: res.arrivalTime || '',
                          date: res.date || getDateRange()[0]
                        });
                        setShowAiInput(false);
                        setAiInputText('');
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="w-full py-2 bg-zinc-900 text-white rounded-lg font-bold shadow-sm"
                  >
                    AI 辨識
                  </button>
                </motion.div>
              )}
            </div>
            <form onSubmit={handleAddFlight} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">航班號</label>
                <input 
                  name="flightNo" 
                  required 
                  value={flightForm.flightNo}
                  onChange={(e) => setFlightForm({...flightForm, flightNo: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none" 
                  placeholder="BR198" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">日期</label>
                <select 
                  name="date" 
                  value={flightForm.date}
                  onChange={(e) => setFlightForm({...flightForm, date: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl"
                >
                  {getDateRange().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">出發機場</label>
                  <input 
                    name="departureAirport" 
                    required 
                    value={flightForm.departureAirport}
                    onChange={(e) => setFlightForm({...flightForm, departureAirport: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" 
                    placeholder="TPE" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">抵達機場</label>
                  <input 
                    name="arrivalAirport" 
                    required 
                    value={flightForm.arrivalAirport}
                    onChange={(e) => setFlightForm({...flightForm, arrivalAirport: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" 
                    placeholder="NRT" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">出發時區</label>
                  <select
                    value={flightForm.departureTimeZone || (selectedTrip ? (TIMEZONE_MAP[selectedTrip.country] ?? 'Asia/Taipei') : 'Asia/Taipei')}
                    onChange={(e) => setFlightForm({...flightForm, departureTimeZone: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl"
                  >
                    {TIME_ZONE_OPTIONS.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">抵達時區</label>
                  <select
                    value={flightForm.arrivalTimeZone || (selectedTrip ? (TIMEZONE_MAP[selectedTrip.country] ?? 'Asia/Taipei') : 'Asia/Taipei')}
                    onChange={(e) => setFlightForm({...flightForm, arrivalTimeZone: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl"
                  >
                    {TIME_ZONE_OPTIONS.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-zinc-400 -mt-2">起飛與抵達時間各自填當地時間，就是機票上印的那個。</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">起飛時間</label>
                  <input 
                    name="departureTime" 
                    type="time" 
                    required 
                    value={flightForm.departureTime}
                    onChange={(e) => setFlightForm({...flightForm, departureTime: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">抵達時間</label>
                  <input 
                    name="arrivalTime" 
                    type="time" 
                    required 
                    value={flightForm.arrivalTime}
                    onChange={(e) => setFlightForm({...flightForm, arrivalTime: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" 
                  />
                </div>
              </div>
              <button type="submit" className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold shadow-lg">確認航班</button>
            </form>
          </Modal>
        )}

        {isAddingAccommodation && (
          <Modal title="新增住宿" onClose={() => {
            setIsAddingAccommodation(false);
            setAccommodationForm({ name: '', address: '', check_in: '', check_out: '' });
            setShowAiInput(false);
            setAiInputText('');
          }}>
            <div className="mb-6">
              <div className="flex gap-2 mb-4">
                <button 
                  onClick={() => setShowAiInput(!showAiInput)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-50 text-zinc-600 rounded-xl font-bold border border-zinc-200"
                >
                  <Sparkles size={18} /> 文字填入
                </button>
                <label className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-50 text-zinc-600 rounded-xl font-bold border border-zinc-200 cursor-pointer">
                  <Camera size={18} /> 拍照填入
                  <input type="file" className="hidden" accept="image/*" onChange={handleScanAccommodation} />
                </label>
              </div>

              {showAiInput && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 p-4 bg-zinc-50 rounded-xl border border-zinc-200 mb-4">
                  <textarea 
                    autoFocus
                    className="w-full p-3 rounded-lg border border-zinc-200 focus:border-zinc-400 outline-none text-sm min-h-[100px]"
                    placeholder="請貼上住宿資訊文字..."
                    value={aiInputText}
                    onChange={(e) => setAiInputText(e.target.value)}
                  />
                  <button 
                    onClick={async () => {
                      if (!aiInputText) return;
                      setLoading(true);
                      try {
                        const res = await geminiService.parseAccommodationInfo(aiInputText);
                        setAccommodationForm({
                          name: res.name || '',
                          address: res.address || '',
                          check_in: res.check_in || '',
                          check_out: res.check_out || ''
                        });
                        setShowAiInput(false);
                        setAiInputText('');
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="w-full py-2 bg-zinc-900 text-white rounded-lg font-bold shadow-sm"
                  >
                    AI 辨識
                  </button>
                </motion.div>
              )}
            </div>
            <form onSubmit={handleAddAccommodation} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">飯店名稱</label>
                <input 
                  name="name" 
                  required 
                  value={accommodationForm.name}
                  onChange={(e) => setAccommodationForm({...accommodationForm, name: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none" 
                  placeholder="APA Hotel" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">飯店地址</label>
                <input 
                  name="address" 
                  required 
                  value={accommodationForm.address}
                  onChange={(e) => setAccommodationForm({...accommodationForm, address: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none" 
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">入住日期</label>
                  <input 
                    name="check_in" 
                    type="date" 
                    required 
                    value={accommodationForm.check_in}
                    onChange={(e) => setAccommodationForm({...accommodationForm, check_in: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">退房日期</label>
                  <input 
                    name="check_out" 
                    type="date" 
                    required 
                    value={accommodationForm.check_out}
                    onChange={(e) => setAccommodationForm({...accommodationForm, check_out: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" 
                  />
                </div>
              </div>
              <button type="submit" className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold shadow-lg">確認住宿</button>
            </form>
          </Modal>
        )}

        {isAddingExpense && (
          <Modal title={editingExpense ? '編輯支出' : '新增花費'} onClose={() => {
            setIsAddingExpense(false);
            setEditingExpense(null);
            setExpenseForm({ description: '', amount: '', currency: 'USD', category: '飲食', date: format(new Date(), 'yyyy-MM-dd') });
          }}>
            {!editingExpense && (
              <div className="mb-6">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50 cursor-pointer hover:bg-zinc-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Camera className="w-8 h-8 mb-2 text-zinc-400" />
                    <p className="text-sm font-bold text-zinc-500">拍照辨識收據 (AI)</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleScanReceipt} />
                </label>
              </div>
            )}
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">款項敘述</label>
                <input 
                  name="description" 
                  required 
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none" 
                  placeholder="例如：拉麵" 
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">金額</label>
                  <input 
                    name="amount" 
                    type="number" 
                    step="0.01" 
                    required 
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none" 
                    placeholder="0.00" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">幣值</label>
                  <select 
                    name="currency" 
                    value={expenseForm.currency}
                    onChange={(e) => setExpenseForm({...expenseForm, currency: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl"
                  >
                    {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="TWD">TWD</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">日期</label>
                  <input 
                    name="date" 
                    type="date" 
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm({...expenseForm, date: e.target.value})}
                    required 
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">類別</label>
                  <select 
                    name="category" 
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl"
                  >
                    {["交通", "住宿", "飲食", "購物", "其他"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold shadow-lg">{editingExpense ? '儲存變更' : '確認記帳'}</button>
            </form>
          </Modal>
        )}

        {isExportModalOpen && (
          <Modal title="匯出行程表" onClose={() => setIsExportModalOpen(false)}>
            <div className="space-y-6">
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                <p className="text-sm text-zinc-600 mb-4">選擇匯出方式，與您的旅伴分享這趟完美的旅程。</p>
                
                <button 
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPdf}
                  className="w-full flex items-center justify-between p-4 bg-white border border-zinc-200 rounded-xl hover:border-zinc-400 transition-all mb-3 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-600 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                      <Download size={20} />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-zinc-900">下載 PDF</div>
                      <div className="text-[10px] text-zinc-400">儲存到您的裝置</div>
                    </div>
                  </div>
                  {isGeneratingPdf && <Loader2 size={16} className="animate-spin text-zinc-400" />}
                </button>

                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200"></div></div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold text-zinc-400"><span className="bg-zinc-50 px-2">或</span></div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-bold text-zinc-900">發送郵件</div>
                  <div className="flex gap-2">
                    <input 
                      type="email" 
                      placeholder="輸入電子信箱..." 
                      value={exportEmail}
                      onChange={(e) => setExportEmail(e.target.value)}
                      className="flex-1 p-3 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:border-zinc-900"
                    />
                    <button 
                      onClick={handleSendEmail}
                      disabled={isSendingEmail || !exportEmail}
                      className="px-6 bg-zinc-900 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSendingEmail ? <Loader2 size={16} className="animate-spin" /> : '發送'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Modal>
        )}

        {editingActivity && (
          <Modal title="編輯行程" onClose={() => setEditingActivity(null)}>
            <form onSubmit={handleUpdateActivity} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">行程名稱</label>
                <input 
                  value={editingActivity.activity} 
                  onChange={e => setEditingActivity({...editingActivity, activity: e.target.value})}
                  required 
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">日期</label>
                <input
                  type="date"
                  value={editingActivity.date}
                  onChange={e => setEditingActivity({...editingActivity, date: e.target.value})}
                  min={selectedTrip.start_date}
                  max={selectedTrip.end_date}
                  required
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">開始時間</label>
                  <input
                    type="time"
                    value={editingActivity.start_time}
                    onChange={e => setEditingActivity({...editingActivity, start_time: e.target.value})}
                    required
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">結束時間</label>
                  <input
                    type="time"
                    value={editingActivity.end_time}
                    onChange={e => setEditingActivity({...editingActivity, end_time: e.target.value})}
                    required
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">Google Map 連結</label>
                <input
                  value={editingActivity.map_url || ''}
                  onChange={e => setEditingActivity({...editingActivity, map_url: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none"
                  placeholder="https://maps.google.com/..."
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-bold text-zinc-600">封面照片</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedTrip) return;
                      geminiService.getActivityPhoto(editingActivity.activity, selectedTrip.country)
                        .then(photoUrl => { if (photoUrl) setEditingActivity(prev => prev ? {...prev, photo_url: photoUrl} : prev); })
                        .catch(() => {});
                    }}
                    className="flex items-center gap-1 text-xs text-purple-600 font-bold hover:text-purple-800 transition-colors"
                  >
                    <Sparkles size={11} /> AI 搜尋照片
                  </button>
                </div>
                {editingActivity.photo_url && (
                  <div className="mb-2 rounded-xl overflow-hidden h-32">
                    <img
                      src={editingActivity.photo_url}
                      alt="preview"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <input
                  value={editingActivity.photo_url || ''}
                  onChange={e => setEditingActivity({...editingActivity, photo_url: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none text-xs"
                  placeholder="貼上圖片 URL，或點「AI 搜尋照片」自動取得"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">備註</label>
                <textarea 
                  value={editingActivity.note || ''} 
                  onChange={e => setEditingActivity({...editingActivity, note: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none min-h-[100px]" 
                />
              </div>
              {/* AI Advice preview + regenerate */}
              {!editingActivity.is_flight && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-bold text-zinc-600">AI 建議</label>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedTrip) return;
                        try {
                          const advice = await geminiService.getItineraryAdvice(editingActivity.activity, selectedTrip.country);
                          if (advice) setEditingActivity(prev => prev ? {...prev, ai_advice: advice} : prev);
                        } catch {}
                      }}
                      className="flex items-center gap-1 text-xs text-amber-600 font-bold hover:text-amber-800 transition-colors"
                    >
                      <Sparkles size={11} /> 重新生成 AI 建議
                    </button>
                  </div>
                  {editingActivity.ai_advice && (() => {
                    try {
                      const parsed = JSON.parse(editingActivity.ai_advice);
                      return (
                        <div className="p-3 bg-amber-50/60 rounded-xl text-[11px] border border-amber-100 space-y-1">
                          <p className="font-bold text-stone-700">{parsed.headline}</p>
                          {Array.isArray(parsed.tips) && parsed.tips.map((tip: string, i: number) => (
                            <p key={i} className="text-stone-600 flex gap-1.5"><span className="text-amber-400">•</span>{tip}</p>
                          ))}
                        </div>
                      );
                    } catch {
                      return <p className="p-3 bg-amber-50/60 rounded-xl text-[11px] text-stone-600 border border-amber-100 italic">{editingActivity.ai_advice}</p>;
                    }
                  })()}
                </div>
              )}
              <button type="submit" className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold shadow-lg transition-all">
                更新行程
              </button>
            </form>
          </Modal>
        )}

        {isExpenseAnalysisOpen && selectedTrip && (
          <Modal title="支出分析 (TWD)" onClose={() => setIsExpenseAnalysisOpen(false)}>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                {["交通", "住宿", "飲食", "購物", "其他"].map(cat => {
                  const catTotalTWD = expenses
                    .filter(e => e.category === cat)
                    .reduce((sum, e) => {
                      const rate = EXCHANGE_RATES[e.currency] || 1;
                      return sum + (e.amount * rate);
                    }, 0);
                  const totalTWD = expenses.reduce((sum, e) => {
                    const rate = EXCHANGE_RATES[e.currency] || 1;
                    return sum + (e.amount * rate);
                  }, 0);
                  const percent = totalTWD > 0 ? Math.round((catTotalTWD / totalTWD) * 100) : 0;
                  
                  return (
                    <div key={cat} className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                      <div className="flex items-center gap-2 text-zinc-400 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider">{cat}</span>
                      </div>
                      <div className="text-lg font-bold text-zinc-900">${Math.round(catTotalTWD).toLocaleString()}</div>
                      <div className="w-full bg-zinc-200 h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-zinc-900 h-full" style={{ width: `${percent}%` }} />
                      </div>
                      <div className="text-[10px] font-bold text-zinc-400 mt-1">{percent}%</div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">所有支出明細</h4>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {[...expenses].sort((a, b) => b.date.localeCompare(a.date)).map((e) => {
                    const rate = EXCHANGE_RATES[e.currency] || 1;
                    const amountTWD = e.amount * rate;
                    return (
                      <div key={e.id} className="flex items-center justify-between p-3 bg-white border border-zinc-100 rounded-xl group">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div>
                            <div className="text-xs font-bold text-zinc-800 truncate">{e.description}</div>
                            <div className="text-[9px] text-zinc-400">{e.date} · {e.category} · {e.amount} {e.currency}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <div className="text-xs font-bold text-zinc-900">${Math.round(amountTWD).toLocaleString()}</div>
                          <button
                            onClick={() => { setIsExpenseAnalysisOpen(false); openEditExpense(e); }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(e.id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-zinc-900 text-white p-5 rounded-2xl shadow-lg">
                <div className="text-[10px] font-bold uppercase opacity-60 mb-1">總計支出 (TWD)</div>
                <div className="text-2xl font-bold">${Math.round(expenses.reduce((sum, e) => {
                  const rate = EXCHANGE_RATES[e.currency] || 1;
                  return sum + (e.amount * rate);
                }, 0)).toLocaleString()}</div>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Calendar sync result. Tapping dismisses; it also clears itself, so a
          message from one trip cannot follow the user into another. */}
      {calendarMessage && (
        <div
          onClick={() => setCalendarMessage('')}
          className="fixed left-1/2 -translate-x-1/2 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] z-[110] max-w-[90vw] px-4 py-2.5 bg-zinc-900 text-white text-xs font-medium rounded-xl shadow-lg cursor-pointer"
        >
          {calendarMessage}
        </div>
      )}

      {/* Global Loader */}
      {loading && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3">
            <Loader2 className="animate-spin text-zinc-900" size={32} />
            <p className="text-sm font-bold text-zinc-900">AI 正在處理中...</p>
          </div>
        </div>
      )}
    </div>
  );


}
