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
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, CURRENCY_MAP, COUNTRY_LIST } from './utils';
import { Trip, Activity, Expense, Accommodation, ChecklistItem, User } from './types';
import { geminiService } from './services/geminiService';
import { db } from './services/firebase';
import { 
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { notoSansTCRegular } from './assets/NotoSansTC-Regular';
import { sourceHanSerifBold as notoSerifTCBold } from './assets/SourceHanSerif-Bold';



const EXCHANGE_RATES: Record<string, number> = {
  'TWD': 1,
  'USD': 32.5,
  'JPY': 0.21,
  'EUR': 35.2,
  'KRW': 0.024,
  'HKD': 4.15,
  'GBP': 41.5,
  'AUD': 21.2,
  'THB': 0.9,
};

export default function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [isAddingTrip, setIsAddingTrip] = useState(false);
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
    date: ''
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
  const [loading, setLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<Record<string, string>>({});
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatMessages, setAiChatMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [isAiChatLoading, setIsAiChatLoading] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('travel_planner_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setIsLoginOpen(false);
    }
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

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    setLoading(true);
    setLoginError('');

    try {
      const q = query(collection(db, "users"), where("username", "==", username), where("password", "==", password));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // For the very first time, if no users exist, let the first login be admin
        const allUsersSnap = await getDocs(collection(db, "users"));
        if (allUsersSnap.empty && username === 'admin') {
          const newUser = {
            username,
            password,
            role: 'admin' as const
          };
          const docRef = await addDoc(collection(db, "users"), newUser);
          const user = { ...newUser, id: docRef.id };
          setCurrentUser(user);
          localStorage.setItem('travel_planner_user', JSON.stringify(user));
          setIsLoginOpen(false);
        } else {
          setLoginError('帳號或密碼錯誤');
        }
      } else {
        const user = { ...snapshot.docs[0].data(), id: snapshot.docs[0].id } as User;
        setCurrentUser(user);
        localStorage.setItem('travel_planner_user', JSON.stringify(user));
        setIsLoginOpen(false);
      }
    } catch (err) {
      console.error(err);
      setLoginError('登入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('travel_planner_user');
    setIsLoginOpen(true);
    setSelectedTrip(null);
  };

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = Math.random().toString(36).slice(-8); // Auto-generate password

    try {
      await addDoc(collection(db, "users"), {
        username,
        password,
        role: 'user'
      });
      alert(`使用者已建立！\n帳號：${username}\n密碼：${password}\n請務必告知使用者此密碼。`);
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      console.error(err);
      alert('建立失敗');
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

    return () => {
      unsubActivities();
      unsubExpenses();
      unsubAccommodations();
      unsubChecklist();
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
      setTrips(tripsList);
    } catch (err) {
      console.error("Error fetching trips:", err);
    }
  };

  

  

  

  

    const handleSelectTrip = (trip: Trip) => {
    setSelectedTrip(trip);
    setActiveTab(trip.start_date);
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

    // Fetch AI advice asynchronously and update the document
    if (!newActivity.is_flight) {
      geminiService.getItineraryAdvice(activityName, selectedTrip.country)
        .then(advice => {
          if (advice) {
            updateDoc(docRef, { ai_advice: advice });
          }
        })
        .catch(err => console.error("Failed to fetch AI advice", err));
    }
  };

  const handleAddFlight = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTrip) return;
    
    const { flightNo, date, departureTime, arrivalTime, arrivalAirport, departureAirport } = flightForm;

    const newActivity = {
      id: crypto.randomUUID(),
      trip_id: selectedTrip.id,
      date,
      start_time: departureTime,
      end_time: arrivalTime,
      activity: `✈️ 航班: ${flightNo} (${departureAirport} 🛫 ${arrivalAirport})`,
      map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(arrivalAirport)}`,
      note: `自動生成航班行程`,
      is_flight: true,
      travel_mode: 'transit',
    };

    try {
            await addDoc(collection(db, "activities"), newActivity);
      setIsAddingFlight(false);
      setFlightForm({ flightNo: '', departureAirport: '', arrivalAirport: '', departureTime: '', arrivalTime: '', date: '' });
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
    const newExpense = {
      id: crypto.randomUUID(),
      trip_id: selectedTrip.id,
      description: formData.get('description') as string,
      category: formData.get('category') as string,
      amount: parseFloat(formData.get('amount') as string),
      currency: formData.get('currency') as string,
      date: format(new Date(), 'yyyy-MM-dd'),
    };
        await addDoc(collection(db, "expenses"), newExpense);
    setIsAddingExpense(false);
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

  const handleAiChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiChatInput.trim() || !selectedTrip) return;

    const userMessage = aiChatInput;
    setAiChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setAiChatInput('');
    setIsAiChatLoading(true);

    try {
      const response = await geminiService.getItinerarySuggestion(selectedTrip, activities, userMessage);
      setAiChatMessages(prev => [...prev, { role: 'ai', content: response || "抱歉，我現在無法回答，請稍後再試。" }]);
    } catch (err) {
      console.error(err);
      setAiChatMessages(prev => [...prev, { role: 'ai', content: "發生錯誤，請檢查網路連線。" }]);
    } finally {
      setIsAiChatLoading(false);
    }
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
          if (res.start_time) (form.elements.namedItem('start_time') as HTMLInputElement).value = res.start_time;
          if (res.end_time) (form.elements.namedItem('end_time') as HTMLInputElement).value = res.end_time;
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
        if (res.start_time) (form.elements.namedItem('start_time') as HTMLInputElement).value = res.start_time;
        if (res.end_time) (form.elements.namedItem('end_time') as HTMLInputElement).value = res.end_time;
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
          date: res.date || getDateRange()[0]
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
      // Translate data to English for PDF
      const dataToTranslate = {
        trip: selectedTrip,
        activities: activities,
        accommodations: accommodations
      };
      
      const translated = await geminiService.translateItinerary(dataToTranslate);
      const tTrip = translated.trip || selectedTrip;
      const tActivities = ((translated.activities || activities) as Activity[]).sort((a, b) => a.start_time.localeCompare(b.start_time));
      const tAccommodations = (translated.accommodations || accommodations) as Accommodation[];

      const doc = new jsPDF();

      // For English PDF, we can use standard fonts or keep Noto for safety, 
      // but we'll use standard Helvetica/Times for a "pure English" feel if possible.
      // However, keeping the font setup ensures special characters are handled.
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
      
      // Header
      doc.setFont('NotoSerifTC', 'bold');
      doc.setFontSize(24);
      doc.setTextColor('#18181b');
      doc.text(tTrip.name, 15, 20);
      
      doc.setFont('NotoSansTC', 'normal');
      doc.setFontSize(10);
      doc.setTextColor('#71717a');
      doc.text(`${tTrip.country} | ${tTrip.start_date} ~ ${tTrip.end_date}`, 15, 28);
      
      doc.setDrawColor('#e4e4e7');
      doc.line(15, 35, pageWidth - 15, 35);
      
      let currentY = 45;

      // Flights
      const flights = tActivities.filter(a => a.is_flight);
      if (flights.length > 0) {
        doc.setFont('NotoSerifTC', 'bold');
        doc.setFontSize(12);
        doc.setTextColor('#a1a1aa');
        doc.text("Flight Information", 15, currentY);
        doc.setFont('NotoSansTC', 'normal');
        currentY += 8;

        autoTable(doc, {
          startY: currentY,
          head: [['Flight/Activity', 'Date', 'Time']],
          body: flights.map(f => [f.activity, f.date, `${f.start_time} - ${f.end_time}`]),
          theme: 'striped',
          styles: { font: 'NotoSansTC', fontStyle: 'normal' },
          headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255] },
          margin: { left: 15, right: 15 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Accommodations
      if (tAccommodations.length > 0) {
        doc.setFont('NotoSerifTC', 'bold');
        doc.setFontSize(12);
        doc.setTextColor('#a1a1aa');
        doc.text("Accommodations", 15, currentY);
        doc.setFont('NotoSansTC', 'normal');
        currentY += 8;

        autoTable(doc, {
          startY: currentY,
          head: [['Hotel Name', 'Address', 'Dates']],
          body: tAccommodations.map(acc => [acc.name, acc.address, `${acc.check_in} ~ ${acc.check_out}`]),
          theme: 'grid',
          styles: { font: 'NotoSansTC', fontStyle: 'normal' },
          headStyles: { fillColor: [113, 113, 122], textColor: [255, 255, 255] },
          margin: { left: 15, right: 15 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Daily Itinerary
      doc.setFont('NotoSerifTC', 'bold');
      doc.setFontSize(12);
      doc.setTextColor('#a1a1aa');
      doc.text("Daily Itinerary", 15, currentY);
      doc.setFont('NotoSansTC', 'normal');
      currentY += 10;

      const dates = getDateRange();
      dates.forEach((date, i) => {
        const dayActs = tActivities.filter(a => a.date === date && !a.is_flight);
        
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.setFillColor('#18181b');
        doc.roundedRect(15, currentY - 5, 25, 7, 1, 1, 'F');
        doc.text(`Day ${i + 1} (${format(parseISO(date), 'M/d')})`, 18, currentY);
        
        doc.setTextColor('#71717a');
        currentY += 10;

        if (dayActs.length === 0) {
          doc.setFontSize(9);
          doc.setTextColor('#a1a1aa');
          doc.text("No activities scheduled", 25, currentY);
          currentY += 10;
        } else {
          dayActs.forEach(a => {
            if (currentY > 270) {
              doc.addPage();
              currentY = 20;
            }
            
            doc.setFontSize(9);
            doc.setTextColor('#18181b');
            doc.text(`${a.start_time} - ${a.end_time}`, 25, currentY);
            
            doc.setFontSize(10);
            doc.setFont('NotoSansTC', 'normal', 'bold');
            doc.text(a.activity, 55, currentY);
            doc.setFont('NotoSansTC', 'normal');
            
            if (a.note) {
              currentY += 5;
              doc.setFontSize(8);
              doc.setTextColor('#71717a');
              const splitNote = doc.splitTextToSize(a.note, pageWidth - 70);
              doc.text(splitNote, 55, currentY);
              currentY += (splitNote.length * 4);
            }
            
            currentY += 8;
          });
        }
        currentY += 5;
      });

      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor('#a1a1aa');
        doc.text("Generated by AI Travel Planner", pageWidth / 2, 285, { align: 'center' });
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

  const handleExportPDF = async () => {
    setIsExportModalOpen(true);
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

      // Regenerate AI advice if name changed and it's not a flight
      if (nameChanged && !editingActivity.is_flight) {
        geminiService.getItineraryAdvice(editingActivity.activity, selectedTrip.country)
          .then(advice => {
            if (advice) {
              updateDoc(activityDoc, { ai_advice: advice });
            }
          })
          .catch(err => console.error("Failed to update AI advice", err));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTrip = async (e: React.MouseEvent, trip: Trip) => {
    e.stopPropagation();
    if (!confirm('確定要刪除整趟旅程嗎？此動作無法復原。')) return;
    try {
      await deleteDoc(doc(db, "trips", trip.documentId || trip.id));
      fetchTrips();
      if (selectedTrip?.id === trip.id) {
        setSelectedTrip(null);
      }
    } catch (err) {
      console.error(err);
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
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center py-4">
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
        {trips.map(trip => (
          <motion.div 
            key={trip.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTrip(trip)}
            className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-zinc-300 transition-colors"
          >
            <div>
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
                      className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors"
                      title="刪除旅程"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm text-zinc-500 mt-1 flex items-center gap-1">
                <Calendar size={14} className="text-zinc-400" /> {trip.start_date} ~ {trip.end_date}
              </p>
              <div className="flex gap-2 mt-2">
                <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-[10px] font-bold rounded uppercase tracking-wider">
                  {trip.country}
                </span>
                {trip.owner_id !== currentUser?.id && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase tracking-wider">
                    受邀行程
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="text-zinc-300" size={20} />
          </motion.div>
        ))}
        {trips.length === 0 && (
          <div className="text-center py-20 text-zinc-400">
            <p className="font-medium">尚未建立任何旅程</p>
            <p className="text-sm">點擊右上角按鈕開始規劃吧！</p>
          </div>
        )}
      </div>
    </div>
  ); }

  function renderTripDetail() {
    if (!selectedTrip) return null;
    const dates = getDateRange();
    const currentActivities = activities
      .filter(a => a.date === activeTab)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    const currentAccommodations = accommodations.filter(acc => {
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
        <div className="bg-white p-4 border-b border-zinc-200 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedTrip(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-600">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-lg font-bold text-zinc-900">{selectedTrip.name}</h2>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{selectedTrip.country}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleExportPDF}
                disabled={isGeneratingPdf}
                className="p-2 bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
                title="匯出 PDF"
              >
                {isGeneratingPdf ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
              </button>
              <button 
                onClick={() => {
                  if (showTotalExpense) {
                    setIsExpenseAnalysisOpen(true);
                  } else {
                    setShowTotalExpense(true);
                  }
                }}
                className="bg-zinc-900 text-white px-4 py-2 rounded-xl shadow-sm active:scale-95 transition-all text-right min-w-[100px]"
              >
                <div className="text-[10px] uppercase font-bold opacity-60">總支出 (TWD)</div>
                <div className="text-md font-bold">
                  {showTotalExpense ? `$${Math.round(totalExpenseTWD).toLocaleString()}` : '點擊查看'}
                </div>
              </button>
            </div>
          </div>

          {/* Date Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {dates.map((date, i) => (
              <button
                key={date}
                onClick={() => setActiveTab(date)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border",
                  activeTab === date 
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-sm" 
                    : "bg-white text-zinc-500 border-zinc-200"
                )}
              >
                Day {i + 1} <span className="font-normal opacity-60 ml-1.5 text-[10px]">({format(parseISO(date), 'M/d')})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32 max-w-2xl mx-auto w-full">
          {/* Core Info Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <button 
                onClick={() => setIsCoreInfoExpanded(!isCoreInfoExpanded)}
                className="flex items-center gap-2 text-sm font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
              >
                核心資訊
                <MoreHorizontal size={14} className={cn("transition-transform", isCoreInfoExpanded ? "rotate-90" : "rotate-0")} />
              </button>
              <div className="flex gap-2">
                <button onClick={() => setIsAddingFlight(true)} className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm">
                  <Plane size={16} />
                </button>
                <button onClick={() => setIsAddingAccommodation(true)} className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm">
                  <Hotel size={16} />
                </button>
              </div>
            </div>
            
            <AnimatePresence>
              {isCoreInfoExpanded && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="grid gap-3 overflow-hidden"
                >
                  {activities.filter(a => a.is_flight).map(flight => (
                    <div key={flight.id} onClick={() => setEditingActivity(flight)} className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm flex items-center gap-3 cursor-pointer hover:border-zinc-300 transition-colors group">
                      <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center">
                        <Plane size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-zinc-900">{flight.activity}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-medium text-zinc-400">{flight.date}</span>
                          <span className="text-[10px] font-bold text-zinc-900">{flight.start_time} - {flight.end_time}</span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteActivity(flight.id); }}
                        className="p-2 text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {accommodations.map(acc => (
                    <div key={acc.id} className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm flex items-center gap-3 group">
                      <div className="w-10 h-10 bg-zinc-50 text-zinc-500 rounded-lg flex items-center justify-center">
                        <Hotel size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-zinc-900">{acc.name}</div>
                        <div className="text-[10px] font-medium text-zinc-400 mt-0.5">{acc.check_in} ~ {acc.check_out}</div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteAccommodation(acc.id); }}
                        className="p-2 text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <button 
                onClick={() => setIsChecklistExpanded(!isChecklistExpanded)}
                className="flex items-center gap-2 text-sm font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
              >
                準備清單
                <MoreHorizontal size={14} className={cn("transition-transform", isChecklistExpanded ? "rotate-90" : "rotate-0")} />
              </button>
            </div>
            
            <AnimatePresence>
              {isChecklistExpanded && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Checklist />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Itinerary Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">今日行程</h3>
            
            {/* Automatic Hotel Start */}
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
              currentActivities.map((activity, idx) => (
                <div key={activity.id}>
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setEditingActivity(activity)}
                    className={cn(
                      "p-4 rounded-2xl border shadow-sm relative group cursor-pointer transition-colors",
                      activity.is_flight 
                        ? "bg-blue-50/30 border-blue-100 hover:border-blue-200" 
                        : "bg-white border-zinc-200 hover:border-zinc-300"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-md",
                          activity.is_flight ? "bg-blue-100 text-blue-700" : "bg-zinc-50 text-zinc-900"
                        )}>{activity.start_time} - {activity.end_time}</span>
                        <h4 className="text-md font-bold text-zinc-900 flex items-center gap-2">
                          {!!activity.is_flight && <Plane size={14} className="text-blue-500" />}
                          {activity.activity}
                        </h4>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteActivity(activity.id); }}
                        className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    
                    {activity.note && (
                      <p className="text-xs text-zinc-500 mb-3 leading-relaxed">{activity.note}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* AI Advice is now automatic */}
                      </div>
                      {activity.map_url && (
                        <a 
                          href={activity.map_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs font-bold text-blue-500 hover:underline"
                        >
                          <MapPin size={12} /> 查看地圖
                        </a>
                      )}
                    </div>

                    {activity.ai_advice && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 p-3 bg-zinc-50 rounded-xl text-[11px] text-zinc-600 border border-zinc-100 italic"
                      >
                        <div className="flex items-center gap-1 mb-1 text-purple-600 font-bold not-italic">
                          <Sparkles size={10} /> AI 建議
                        </div>
                        {activity.ai_advice}
                      </motion.div>
                    )}
                  </motion.div>

                  {/* Travel Time Indicator Removed */}
                  {idx < currentActivities.length - 1 && (
                    <div className="py-2 flex flex-col items-center">
                      <div className="w-px h-6 bg-zinc-200" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Floating Action Buttons */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-2 bg-white p-1.5 rounded-2xl shadow-xl border border-zinc-200 z-20">
          <button 
            onClick={() => setIsAddingActivity(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-900 text-white rounded-xl font-bold shadow-sm active:scale-95 transition-all whitespace-nowrap text-sm"
          >
            <Plus size={18} /> 新增行程
          </button>
          <button 
            onClick={() => setIsAddingExpense(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-zinc-900 border border-zinc-200 rounded-xl font-bold shadow-sm active:scale-95 transition-all whitespace-nowrap text-sm"
          >
            <Wallet size={18} /> 新增記帳
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      <AnimatePresence mode="wait">
        {!selectedTrip ? (
          <motion.div 
            key="list"
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
                <select name="country" className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                  {COUNTRY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
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

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">帳號</label>
                  <input 
                    name="username" 
                    required 
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none" 
                    placeholder="請輸入帳號"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-600 mb-1">密碼</label>
                  <input 
                    name="password" 
                    type="password"
                    required 
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none" 
                    placeholder="請輸入密碼"
                  />
                </div>
                {loginError && <p className="text-xs text-red-500 font-bold">{loginError}</p>}
                <button type="submit" className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold shadow-lg active:scale-[0.98] transition-all">
                  登入
                </button>
              </form>
              <p className="text-[10px] text-zinc-400 text-center mt-6">
                提示：若是首次登入，請輸入 admin 作為帳號以建立管理員權限。
              </p>
            </motion.div>
          </div>
        )}

        {/* AI Chat Button */}
        {selectedTrip && (
          <>
            <button
              onClick={() => setIsAiChatOpen(true)}
              className="fixed bottom-6 right-6 w-14 h-14 bg-zinc-900 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-50"
              title="AI 行程顧問"
            >
              <Sparkles size={24} />
            </button>

            <AnimatePresence>
              {isAiChatOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  className="fixed bottom-24 right-6 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-zinc-200 z-50 flex flex-col overflow-hidden max-h-[600px]"
                >
                  <div className="p-4 bg-zinc-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles size={18} />
                      <h3 className="font-bold">AI 行程顧問</h3>
                    </div>
                    <button onClick={() => setIsAiChatOpen(false)} className="p-1 hover:bg-zinc-800 rounded-lg transition-colors">
                      <X size={18} />
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[400px] bg-zinc-50">
                    {aiChatMessages.length === 0 && (
                      <div className="text-center text-zinc-400 text-sm py-8">
                        <p>👋 你好！我是你的 AI 行程顧問。</p>
                        <p className="mt-2">不知道某個景點該排在哪一天嗎？</p>
                        <p>問我就對了！我會根據你的現有行程給出建議。</p>
                      </div>
                    )}
                    {aiChatMessages.map((msg, idx) => (
                      <div key={idx} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap",
                          msg.role === 'user' 
                            ? "bg-zinc-900 text-white rounded-tr-none" 
                            : "bg-white border border-zinc-200 text-zinc-800 rounded-tl-none shadow-sm"
                        )}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isAiChatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-zinc-200 p-3 rounded-2xl rounded-tl-none shadow-sm">
                          <Loader2 size={16} className="animate-spin text-zinc-400" />
                        </div>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleAiChatSubmit} className="p-3 bg-white border-t border-zinc-100 flex gap-2">
                    <input
                      value={aiChatInput}
                      onChange={(e) => setAiChatInput(e.target.value)}
                      placeholder="例如：我想去晴空塔，排在哪天比較順？"
                      className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    />
                    <button 
                      type="submit" 
                      disabled={!aiChatInput.trim() || isAiChatLoading}
                      className="p-2 bg-zinc-900 text-white rounded-xl disabled:opacity-50 hover:bg-zinc-800 transition-colors"
                    >
                      <Navigation size={18} className="rotate-90" />
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {isUserManagementOpen && (
          <Modal title="使用者管理" onClose={() => setIsUserManagementOpen(false)}>
            <div className="space-y-6">
              <form onSubmit={handleAddUser} className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">新增使用者</h4>
                <div className="flex gap-2">
                  <input 
                    name="username" 
                    required 
                    className="flex-1 p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none text-sm" 
                    placeholder="使用者名稱"
                  />
                  <button type="submit" className="px-6 bg-zinc-900 text-white rounded-xl font-bold text-sm">新增</button>
                </div>
              </form>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">現有使用者</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {allUsers.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-100 rounded-xl">
                      <div>
                        <div className="text-sm font-bold text-zinc-800">{user.username}</div>
                        <div className="text-[10px] text-zinc-400">密碼：{user.password} · 權限：{user.role}</div>
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
                <select name="date" defaultValue={activeTab || getDateRange()[0]} className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                  {getDateRange().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">開始時間</label>
                  <input name="start_time" type="time" required className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">結束時間</label>
                  <input name="end_time" type="time" required className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl" />
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
            setFlightForm({ flightNo: '', departureAirport: '', arrivalAirport: '', departureTime: '', arrivalTime: '', date: '' });
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
          <Modal title="新增花費" onClose={() => {
            setIsAddingExpense(false);
            setExpenseForm({ description: '', amount: '', currency: 'USD', category: '飲食', date: format(new Date(), 'yyyy-MM-dd') });
          }}>
            <div className="mb-6">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50 cursor-pointer hover:bg-zinc-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Camera className="w-8 h-8 mb-2 text-zinc-400" />
                  <p className="text-sm font-bold text-zinc-500">拍照辨識收據 (AI)</p>
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={handleScanReceipt} />
              </label>
            </div>
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
                    {Object.values(CURRENCY_MAP).map(c => <option key={c} value={c}>{c}</option>)}
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
              <button type="submit" className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold shadow-lg">確認記帳</button>
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
                <label className="block text-sm font-bold text-zinc-600 mb-1">備註</label>
                <textarea 
                  value={editingActivity.note || ''} 
                  onChange={e => setEditingActivity({...editingActivity, note: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-zinc-400 outline-none min-h-[100px]" 
                />
              </div>
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
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">大額支出 (換算台幣)</h4>
                <div className="space-y-2">
                  {[...expenses].sort((a, b) => {
                    const rateA = EXCHANGE_RATES[a.currency] || 1;
                    const rateB = EXCHANGE_RATES[b.currency] || 1;
                    return (b.amount * rateB) - (a.amount * rateA);
                  }).slice(0, 5).map((e, idx) => {
                    const rate = EXCHANGE_RATES[e.currency] || 1;
                    const amountTWD = e.amount * rate;
                    return (
                      <div key={e.id} className="flex items-center justify-between p-3 bg-white border border-zinc-100 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-zinc-100 text-zinc-500 rounded flex items-center justify-center font-bold text-[10px]">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-zinc-800">{e.description}</div>
                            <div className="text-[9px] text-zinc-400">{e.date} · {e.category} ({e.amount} {e.currency})</div>
                          </div>
                        </div>
                        <div className="text-xs font-bold text-zinc-900">${Math.round(amountTWD).toLocaleString()}</div>
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

function Modal({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-zinc-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-400">
            <X size={20} />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto no-scrollbar">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}
