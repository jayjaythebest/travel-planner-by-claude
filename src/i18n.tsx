import { useSyncExternalStore } from 'react';
import { cn } from './utils';

/**
 * UI language: Traditional Chinese or English.
 *
 * Keys are the Chinese strings themselves, so the Chinese UI needs no table
 * and a string missing from EN falls back to Chinese instead of showing a key.
 * `{name}` placeholders are filled from `vars`.
 *
 * Only the interface is translated. Values stored in Firestore — expense
 * categories, the "✈️ 航班:" activity prefix that parseFlightActivity reads —
 * stay Chinese and are translated where they are displayed, because they are
 * shared between travellers who may have picked different languages.
 */
export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'tp.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {}
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs.some(l => l?.toLowerCase().startsWith('zh')) ? 'zh' : 'en';
}

let current: Lang = initialLang();
document.documentElement.lang = current === 'en' ? 'en' : 'zh-Hant';
const listeners = new Set<() => void>();

export const getLang = () => current;

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
  listeners.forEach(fn => fn());
}

/** Re-renders the calling component when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLang,
  );
}

export function t(zh: string, vars?: Record<string, string | number>): string {
  const s = current === 'en' ? (EN[zh] ?? zh) : zh;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export function LangToggle({ compact = false }: { compact?: boolean }) {
  const lang = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      title={lang === 'zh' ? 'Switch to English' : '切換成中文'}
      className={cn(
        'bg-white border border-zinc-200 text-zinc-600 rounded-xl shadow-sm hover:bg-zinc-50 transition-colors font-bold',
        compact ? 'px-2 py-1 text-[11px] rounded-lg bg-zinc-100 border-transparent shadow-none' : 'px-3 py-2 text-sm',
      )}
    >
      {lang === 'zh' ? 'EN' : '中'}
    </button>
  );
}

const EN: Record<string, string> = {
  // ── Trip list ──
  '{days}天{nights}夜': '{days}D{nights}N',
  '出發還有 {n} 天': '{n} days to go',
  '旅程進行中': 'In progress',
  '已完成': 'Completed',
  '我的旅程': 'My Trips',
  '歡迎回來, {name}': 'Welcome back, {name}',
  '使用者管理': 'User management',
  '成員管理': 'Members',
  '從檔案匯入行程': 'Import itinerary from file',
  '匯入行程': 'Import',
  '新增旅程': 'New trip',
  '登出': 'Sign out',
  '管理旅伴': 'Manage travel buddies',
  '刪除旅程': 'Delete trip',
  '受邀行程': 'Shared with me',
  '尚未建立任何旅程': 'No trips yet',
  '點擊右上角按鈕開始規劃吧！': 'Tap the button at the top right to start planning!',

  // ── Login ──
  '旅程規劃助手': 'Travel Planner',
  '請登入以開始規劃您的旅程': 'Sign in to start planning your trip',
  '使用 Google 登入': 'Sign in with Google',
  '第一次登入會自動建立帳號。行程的讀寫權限由 Firestore 規則依你的 Google 帳號判定，所以登入是必要的，不只是為了記住你是誰。':
    'Your account is created automatically the first time you sign in. Access to trips is checked against your Google account, so signing in is required — it is not just to remember who you are.',
  '讀取使用者資料失敗，請重新登入。': 'Could not load your profile. Please sign in again.',
  '登入視窗被關閉，尚未登入。': 'The sign-in window was closed. You are not signed in.',
  '登入視窗被瀏覽器封鎖，請允許彈出式視窗後再試。': 'The browser blocked the sign-in window. Allow pop-ups and try again.',
  '登入失敗，請稍後再試。': 'Sign-in failed. Please try again later.',

  // ── Users / buddies ──
  '成員無法從這裡新增 —— 每個人自己用 Google 登入一次就會出現在下面的清單裡，之後才能被加進行程的旅伴。權限一律是「user」，要升成 admin 只能在 Firebase console 改，這是規則本身擋的，不是介面沒做。':
    'Members cannot be added here — each person signs in with Google once, then appears in the list below and can be added to a trip. Everyone starts as "user"; promoting someone to admin can only be done in the Firebase console, by design.',
  '現有使用者': 'Users',
  '權限：': 'Role: ',
  '確定要刪除此使用者嗎？': 'Delete this user?',
  '管理旅伴: {name}': 'Travel buddies: {name}',
  '選擇要加入此旅程的成員': 'Choose who joins this trip',
  '尚無其他使用者可供指派': 'No other users to add yet',
  '指派旅伴 (可多選)': 'Travel buddies (select any)',
  '取消': 'Cancel',
  '儲存變更': 'Save changes',

  // ── Trip delete ──
  '活動': 'activities',
  '支出': 'expenses',
  '清單項目': 'checklist items',
  '{n} 筆{what}': '{n} {what}',
  '確定要刪除「{name}」嗎？': 'Delete "{name}"?',
  '將一併刪除 {parts}。': ' This also deletes {parts}.',
  '、': ', ',
  '這趟底下沒有其他資料。': ' Nothing else is attached to it.',
  '注意：Google Calendar 上那 {n} 筆事件不會被移除，要自己去日曆刪。':
    'Note: the {n} Google Calendar events will not be removed — delete them in your calendar.',
  '此動作無法復原。': 'This cannot be undone.',

  // ── New trip ──
  '建立新旅程': 'New trip',
  '旅程名稱': 'Trip name',
  '例如：東京 2025': 'e.g. Tokyo 2025',
  '開始日期': 'Start date',
  '結束日期': 'End date',
  '國家': 'Country',
  '確認建立': 'Create',
  '搜尋國家…': 'Search countries…',
  '請選擇國家': 'Choose a country',
  '找不到「{q}」': 'No match for "{q}"',

  // ── Trip header ──
  '新增航班': 'Add flight',
  '新增住宿': 'Add lodging',
  '匯出 PDF': 'Export PDF',
  '連動 Google Calendar': 'Sync to Google Calendar',
  '連動 Google Calendar（上次同步 {at}）': 'Sync to Google Calendar (last synced {at})',
  '已連動 Google Calendar：新增 {added}、更新 {updated}、移除 {removed}':
    'Synced to Google Calendar: {added} added, {updated} updated, {removed} removed',
  '同步失敗，請稍後再試。': 'Sync failed. Please try again later.',
  '總支出': 'Total spent',
  '查看': 'Show',
  '查看支出': 'Show spending',
  '總覽': 'Overview',

  // ── Day view ──
  '🔑 今日入住': '🔑 Check-in today',
  '🧳 今日退房': '🧳 Check-out today',
  '地圖': 'Map',
  '準備清單': 'Packing list',
  '新增準備物品...': 'Add an item...',
  '新增': 'Add',
  '今日行程': "Today's plan",
  '今日需求': 'Ask AI',
  '告訴 AI 你今天的需求': 'Tell AI what you need today',
  '例：想買抹茶、找藥妝店、喝一杯精品咖啡...': 'e.g. buy matcha, find a pharmacy, a good coffee...',
  '思考中': 'Thinking',
  '取得建議': 'Suggest',
  '查看地圖': 'View map',
  '加入今日行程': 'Add to today',
  '從 {name} 出發': 'Starting from {name}',
  '這天還沒有行程喔！': 'Nothing planned for this day yet!',
  '餐廳': 'Restaurant',
  '咖啡廳': 'Café',
  '景點': 'Sight',
  '購物': 'Shopping',
  '其他': 'Other',
  '住宿': 'Lodging',
  '交通': 'Transport',
  '飲食': 'Food',
  'AI 建議': 'AI tips',
  '暫無建議': 'No tips yet',
  '✈ 去程': '✈ Outbound',
  '✈ 回程': '✈ Return',
  '計算中...': 'Calculating...',
  '新增記帳': 'Add expense',
  '新增行程': 'Add activity',
  '確定要刪除此行程嗎？': 'Delete this activity?',
  '確定要刪除此住宿資訊嗎？': 'Delete this lodging?',
  '確定要刪除此支出嗎？': 'Delete this expense?',
  'AI 正在處理中...': 'AI is working...',

  // ── Add activity ──
  'AI 智慧匯入 (文字)': 'AI import (text)',
  '拍照匯入': 'Import from photo',
  '請貼上訂位確認信、行程文字或任何旅遊資訊...': 'Paste a booking confirmation, itinerary text or any travel info...',
  '開始解析': 'Parse',
  '日期': 'Date',
  '開始時間': 'Start time',
  '結束時間 (預設+2小時)': 'End time (default +2h)',
  '結束時間': 'End time',
  '活動名稱': 'Activity',
  '例如：淺草寺 (若留空將嘗試從地圖連結自動填入)': 'e.g. Senso-ji (leave empty to fill from the map link)',
  'Google Maps 連結 (選填)': 'Google Maps link (optional)',
  '交通方式 (前往此地)': 'Getting there',
  '大眾運輸': 'Public transit',
  '步行': 'Walking',
  '駕車': 'Driving',
  '備註': 'Notes',
  '想吃什麼、看什麼...': 'What to eat, what to see...',
  '加入行程': 'Add to plan',
  '新行程': 'New activity',
  '解析失敗，請稍後再試': 'Could not parse that. Please try again later.',

  // ── Flight ──
  '文字填入': 'Fill from text',
  '拍照填入': 'Fill from photo',
  '請貼上航班資訊文字...': 'Paste flight details...',
  'AI 辨識': 'Recognize with AI',
  '航班號': 'Flight no.',
  '出發機場': 'From airport',
  '抵達機場': 'To airport',
  '出發時區': 'Departure time zone',
  '抵達時區': 'Arrival time zone',
  '起飛與抵達時間各自填當地時間，就是機票上印的那個。': 'Enter each time in local time — exactly as printed on the ticket.',
  '起飛時間': 'Departure time',
  '抵達時間': 'Arrival time',
  '確認航班': 'Add flight',
  '航班': 'Flights',
  '航班:': 'Flight:',
  '台北 (UTC+8)': 'Taipei (UTC+8)',
  '東京 (UTC+9)': 'Tokyo (UTC+9)',
  '首爾 (UTC+9)': 'Seoul (UTC+9)',
  '曼谷 (UTC+7)': 'Bangkok (UTC+7)',
  '香港 (UTC+8)': 'Hong Kong (UTC+8)',
  '杜拜 (UTC+4)': 'Dubai (UTC+4)',
  '倫敦 (UTC+0/+1)': 'London (UTC+0/+1)',
  '巴黎 (UTC+1/+2)': 'Paris (UTC+1/+2)',
  '紐約／波士頓 (UTC-5/-4)': 'New York / Boston (UTC-5/-4)',
  '芝加哥／休士頓 (UTC-6/-5)': 'Chicago / Houston (UTC-6/-5)',
  '丹佛 (UTC-7/-6)': 'Denver (UTC-7/-6)',
  '墨西哥城 (UTC-6)': 'Mexico City (UTC-6)',
  '馬德里 (UTC+1/+2)': 'Madrid (UTC+1/+2)',
  '新加坡 (UTC+8)': 'Singapore (UTC+8)',
  '沒有讀到航班資訊': 'No flight details found',
  '讀到 {n} 班航班': '{n} flights found',
  '改成手動填寫': 'Enter manually instead',
  '旅程時區': 'trip time zone',
  '不在旅程日期內，預設不加入': 'Outside the trip dates — not added by default',
  '誰搭這些航班': "Who's on these flights",
  '加入 {n} 班航班': 'Add {n} flights',
  '已加入 {added} 班航班，{joined} 班已有人登記（已加入乘客）': 'Added {added} flights; {joined} were already on the trip (passengers added)',
  '洛杉磯 (UTC-8/-7)': 'Los Angeles (UTC-8/-7)',
  '雪梨 (UTC+10/+11)': 'Sydney (UTC+10/+11)',
  '三蘭港 (UTC+3)': 'Dar es Salaam (UTC+3)',

  // ── Lodging ──
  '請貼上住宿資訊文字...': 'Paste lodging details...',
  '飯店名稱': 'Hotel name',
  '飯店地址': 'Address',
  '入住日期': 'Check-in',
  '退房日期': 'Check-out',
  '確認住宿': 'Add lodging',

  // ── Expenses ──
  '編輯支出': 'Edit expense',
  '新增花費': 'Add expense',
  '拍照辨識收據 (AI)': 'Scan a receipt (AI)',
  '款項敘述': 'Description',
  '例如：拉麵': 'e.g. Ramen',
  '金額': 'Amount',
  '幣值': 'Currency',
  '類別': 'Category',
  '確認記帳': 'Save expense',
  '支出分析 ({cur})': 'Spending ({cur})',
  '所有支出明細': 'All expenses',
  '總計支出 ({cur})': 'Total ({cur})',

  // ── Export ──
  '匯出行程表': 'Export itinerary',
  '選擇匯出方式，與您的旅伴分享這趟完美的旅程。': 'Choose how to export and share the trip with your travel buddies.',
  '下載 PDF': 'Download PDF',
  '儲存到您的裝置': 'Save to this device',
  '或': 'or',
  '發送郵件': 'Send by email',
  '輸入電子信箱...': 'Email address...',
  '發送': 'Send',
  '{name}_行程表.pdf': '{name}_itinerary.pdf',
  '行程表已成功發送到您的信箱！': 'The itinerary has been sent to your inbox!',
  '發送失敗，請稍後再試。': 'Sending failed. Please try again later.',
  '發送失敗，請檢查網路連線。': 'Sending failed. Check your connection.',

  // ── Edit activity ──
  '編輯行程': 'Edit activity',
  '行程名稱': 'Activity',
  'Google Map 連結': 'Google Maps link',
  '封面照片': 'Cover photo',
  'AI 搜尋照片': 'Find photo with AI',
  '貼上圖片 URL，或點「AI 搜尋照片」自動取得': 'Paste an image URL, or tap "Find photo with AI"',
  '重新生成 AI 建議': 'Regenerate AI tips',
  '更新行程': 'Update activity',
  '刪除失敗。這趟旅程還在，可以再試一次。': 'Delete failed. The trip is still there — you can try again.',
  '更新失敗': 'Update failed',

  // ── Overview ──
  '出發倒數 {n} 天': '{n} days to go',
  'Day {list} 等 {n} 天': 'Day {list} and more ({n} days)',
  '還沒有登記任何住宿': 'No lodging added yet',
  '{days}的晚上還沒有住宿': 'No lodging yet for the night of {days}',
  '還沒有登記航班': 'No flights added yet',
  '{days}還是空的': '{days} still empty',
  '去 Day {n}': 'Go to Day {n}',
  '出發': 'Depart',
  '回程': 'Return',
  '行程': 'Plans',
  '另有 {n} 段航班': 'plus {n} flights',
  '個景點與活動': 'places & activities',
  '{done}／{total} 晚已安排': '{done}/{total} nights booked',
  '當日來回': 'Day trip',
  '{n} 筆 · {cur}': '{n} items · {cur}',
  '完成 {pct}%': '{pct}% done',
  '尚未建立': 'Not started',
  '還缺什麼': 'Still missing',
  '每日一覽': 'Day by day',
  '今天': 'Today',
  '入住 {name}': 'Check in: {name}',
  '退房 {name}': 'Check out: {name}',
  '這天還是空的': 'Nothing planned yet',
  '{n} 項行程': '{n} activities',
  '{n} 晚': '{n} nights',
  '支出分布': 'Spending by category',
  '詳細分析 →': 'Details →',
  '還有 {n} 項沒準備，在 Day 1 可以勾選': '{n} items left to pack — tick them off on Day 1',
  '建議': 'Suggested',
  '付款人': 'Paid by',
  '平分給': 'Split equally among',
  '不分帳，只記錄這筆支出': 'Not split — just recorded',
  '每人 {amt} {cur}': '{amt} {cur} each',
  '{name} 付款 · {n} 人平分': '{name} paid · split {n} ways',
  '分帳結算 ({cur})': 'Settle up ({cur})',
  '已經兩清': 'All settled',
  '只計入有勾選平分對象的支出。+ 代表別人欠他，− 代表他要付。': 'Only split expenses count. + means they are owed, − means they owe.',
  '顯示全部': 'Show all',
  '酒吧': 'Bar',
  '訂位狀況': 'Reservations',
  '已訂 {n}／{total}': '{n}/{total} booked',
  '已請 Muse 查詢': 'Asked Muse',
  '已訂位': 'Booked',
  '可訂': 'Available',
  '需綁卡': 'Needs card',
  '訂不到': 'Unavailable',
  '現場排隊': 'Walk-in',
  '等待寄出': 'Not sent yet',
  '目前沒有已訂或接洽中的訂位': 'Nothing booked or in progress yet',
  '✓ 標記已訂': '✓ Mark booked',
  '✕ 訂不到': '✕ No table',
  '旅程期間訂不到': 'No table during the trip',
  '{n} 天': '{n} days',
  '{n} 班': '{n} flights',
  '{n} 人': '{n} people',
  '{n} 人還沒登記': '{n} without a flight',
  '{n} 間': '{n} places',
  'Muse 訂位：開': 'Muse booking: on',
  '開始請 Muse 訂位': 'Ask Muse to book',
  '還沒開啟。開啟後每 10 分鐘檢查一次，有新的店就寄信給 Muse。': 'Off. Once on, new places are emailed to Muse within 10 minutes.',
  '確認碼：{code}': 'Confirmation: {code}',
  '每 10 分鐘讀取 Muse 的回覆 · 上次寄出 {sent} · 上次回覆 {reply}': 'Muse replies are checked every 10 minutes · last sent {sent} · last reply {reply}',
  '誰搭這班': "Who's on this flight",
  '同一班已經有人登記的話，會直接把乘客加進那班。': 'If someone already added this flight, you are added to it instead of creating a duplicate.',
  '{no} 已經有人登記，已把乘客加進這班': '{no} was already added — passengers added to it',
  '還沒有人': 'Nobody yet',
  '我不搭這班': "I'm not on it",
  '我也搭這班': "I'm on this flight",
  '{names} 還沒登記航班': '{names}: no flight added yet',
  '誰搭哪一班': 'Who flies when',
  '還沒登記航班': 'No flight added yet',
  '去': 'Out',
  '回': 'Back',
  '全部加入行程': 'Add all to plan',
  '加入這筆': 'Add this one',
  '已加入 {n} 筆': '{n} already added',
  '加入失敗，請再試一次。': 'Could not add it. Please try again.',

  // ── Idea stash ──
  '靈感暫存區': 'Idea stash',
  '想去但還沒決定哪天的地方 · {n} 個待安排': 'Places you want to go, day not decided · {n} to schedule',
  '安排中': 'Planning',
  'AI 建議安排': 'AI: suggest days',
  '貼上網站內容': 'Paste from a website',
  '手動新增': 'Add manually',
  '把部落格、網站或朋友傳來的文字整段貼進來，AI 會挑出裡面提到的地點…':
    'Paste text from a blog, website or a friend’s message — AI will pick out the places it mentions…',
  '來源網址（選填，之後可以點回去看原文）': 'Source URL (optional, to find the original later)',
  '擷取中…': 'Extracting…',
  'AI 擷取地點': 'Extract places with AI',
  '擷取後可以勾選要收藏的項目': 'You can pick which ones to keep afterwards',
  '找到 {n} 個地點': '{n} places found',
  '全部取消': 'Deselect all',
  '全選': 'Select all',
  '加入收藏（{n}）': 'Save ({n})',
  '地點名稱': 'Place name',
  '為什麼想去？（選填）': 'Why go? (optional)',
  '已選 {n} 張照片': '{n} photos selected',
  '附上照片（選填）': 'Attach photos (optional)',
  '加入收藏': 'Save',
  '還沒有收藏任何地點': 'No places saved yet',
  '看到想去的地方就先丟進來，': 'Drop places in as you find them,',
  '哪一天去之後再決定': 'and decide which day later',
  '由 {name} 加入': 'Added by {name}',
  '建議排在 Day {n}': 'Suggested for Day {n}',
  '就這樣排': 'Schedule it',
  '照片': 'Photos',
  '原文': 'Source',
  '排進行程': 'Schedule',
  '哪一天': 'Day',
  '時間': 'Time',
  '確認加入': 'Add',
  '已排進行程（{n}）': 'Scheduled ({n})',
  '放回收藏': 'Back to stash',
  '由 {name} 上傳': 'Uploaded by {name}',
  '刪除': 'Delete',
  '關閉': 'Close',
  '無法讀取這張圖片': 'Could not read this image',
  '圖片太大，壓縮後仍超過上限': 'The image is too large, even after compression',
  '這段文字裡沒有找到具體的地點，可以試試貼多一點內容。': 'No specific places found in that text — try pasting more of it.',
  'AI 讀取失敗，請稍後再試一次。': 'AI could not read it. Please try again later.',
  '儲存失敗，請再試一次。': 'Saving failed. Please try again.',
  '{n} 張照片上傳失敗，請再試一次。': '{n} photos failed to upload. Please try again.',
  'AI 這次沒有給出可用的建議，可以先手動安排幾天再試。': 'AI had no usable suggestions this time — schedule a few days by hand and try again.',
  'AI 建議失敗，請稍後再試。': 'AI suggestions failed. Please try again later.',

  // ── Import from file ──
  '匯入的行程': 'Imported trip',
  '檔案 {mb} MB，超過 15 MB 上限。': 'The file is {mb} MB, over the 15 MB limit.',
  '讀得到檔案，但裡面找不到可以排進行程的活動。換一個檔案或手動建立旅程。':
    'The file was read, but no activities were found in it. Try another file or create the trip by hand.',
  '解析失敗，請確認檔案內容是行程表，或稍後再試。': 'Parsing failed. Make sure the file is an itinerary, or try again later.',
  '寫入失敗，沒有任何資料被建立。請再試一次。': 'Saving failed and nothing was created. Please try again.',
  'AI 正在讀 {name}…': 'AI is reading {name}…',
  '整份行程手冊可能要等半分鐘': 'A full itinerary can take about half a minute',
  '把行程檔拖進來，或點擊選擇': 'Drop an itinerary file here, or tap to choose',
  'PDF、截圖、純文字都可以': 'PDF, screenshots or plain text',
  '檔案會傳給 Gemini 解析。解析完會先讓你檢查與修改，': 'The file is sent to Gemini to parse. You review and edit the result first —',
  '確認之後才會真的建立旅程': 'the trip is only created once you confirm',
  ' —— AI 讀出來的時間多半是它依活動性質推的，不是檔案裡寫的。': '. Most times are AI guesses based on the activity, not read from the file.',
  '出發日期': 'Start date',
  '共 {days} 天、{n} 筆活動': '{days} days, {n} activities',
  ' · 選了出發日期才能算出結束日': ' · pick a start date to get the end date',
  '（這天沒有活動）': '(no activities this day)',
  '移除這筆': 'Remove',
  '建立中…': 'Creating…',
  '確認建立（{n} 筆活動）': 'Create ({n} activities)',
  '名稱、國家、出發日期都填了才能建立': 'Fill in the name, country and start date to create the trip',

  // ── Google Calendar ──
  'Google 登入元件載入失敗，請確認網路連線或擋廣告的擴充套件。': 'Google sign-in failed to load. Check your connection or ad-blocking extensions.',
  'Google 登入元件載入失敗，請重新整理後再試。': 'Google sign-in failed to load. Refresh and try again.',
  'Google 授權視窗沒有出現，可能被瀏覽器封鎖了。請允許這個網站顯示彈出式視窗後再試一次。':
    'The Google authorization window did not appear — the browser may have blocked it. Allow pop-ups for this site and try again.',
  'Google 授權未完成，請再試一次。': 'Google authorization did not finish. Please try again.',
  '授權視窗被關閉，尚未同步。': 'The authorization window was closed. Nothing was synced.',
  '無法開啟 Google 授權視窗，請確認瀏覽器沒有封鎖彈出視窗。': 'Could not open the Google authorization window. Make sure pop-ups are not blocked.',
  'Google 授權已失效或權限不足，請再按一次同步並重新授權。': 'Google authorization expired or lacks permission. Press sync again and re-authorize.',
  '尚未設定 VITE_GOOGLE_OAUTH_CLIENT_ID，無法連動 Google Calendar。': 'VITE_GOOGLE_OAUTH_CLIENT_ID is not set, so Google Calendar sync is unavailable.',
  '更新「{name}」失敗（HTTP {status}）。': 'Updating "{name}" failed (HTTP {status}).',
  '建立「{name}」失敗（HTTP {status}）。': 'Creating "{name}" failed (HTTP {status}).',
  '移除已刪除的行程失敗（HTTP {status}）。': 'Removing deleted activities failed (HTTP {status}).',
};
