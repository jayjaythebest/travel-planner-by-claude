import { GoogleGenAI, Type } from "@google/genai";
import { getLang } from "../i18n";
import { countryCode } from "../utils";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" });

/**
 * The language AI-written text comes back in: whatever the person asking has
 * the UI set to. Results that are stored (advice, travel times, idea notes)
 * keep the language of whoever generated them; regenerating rewrites them.
 */
const outLang = () => (getLang() === 'en' ? 'English' : '繁體中文');

export type MapPlace = {
  title: string;
  category: 'restaurant' | 'cafe' | 'bar' | 'landmark' | 'shopping' | 'stay' | 'other';
  area: string;
  address: string;
  note: string;
  /** English country name from Places, for the "not in this trip's country" check. */
  country: string;
  map_url: string;
};

export const MAPS_LINK_RE = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps)[^\s"'<>)]*/g;

/** Name and coordinates straight from a long google.com/maps link; null for a short one. */
function parseLongMapsUrl(link: string): { name: string; lat?: number; lng?: number } | null {
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  if (!/google\./.test(u.hostname)) return null;
  const at = link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const coords = at ? { lat: Number(at[1]), lng: Number(at[2]) } : {};
  const place = u.pathname.match(/\/maps\/place\/([^/]+)/);
  const name = place ? decodeURIComponent(place[1].replace(/\+/g, ' ')) : u.searchParams.get('q') || u.searchParams.get('query');
  return name ? { name, ...coords } : null;
}

const TYPE_CATEGORY: [RegExp, MapPlace['category']][] = [
  [/^(cafe|coffee_shop|tea_house|bakery|dessert_shop|cafeteria)$/, 'cafe'],
  [/^(bar|pub|wine_bar|night_club|cocktail_bar|bar_and_grill)$/, 'bar'],
  [/restaurant|^(meal_takeaway|food_court|diner|brunch_restaurant)$/, 'restaurant'],
  [/^(lodging|hotel|resort_hotel|hostel|bed_and_breakfast|guest_house)$/, 'stay'],
  [/store$|^(shopping_mall|market|department_store)$/, 'shopping'],
  [/^(tourist_attraction|museum|park|church|place_of_worship|art_gallery|historical_landmark|monument|zoo|aquarium|amusement_park|national_park|castle|beach|observation_deck|cultural_landmark|plaza)$/, 'landmark'],
];

async function lookupPlace(hint: { name: string; lat?: number; lng?: number }): Promise<MapPlace | null> {
  const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!mapsKey) return null;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': mapsKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.types,places.primaryType,places.googleMapsUri,places.addressComponents,places.editorialSummary',
    },
    body: JSON.stringify({
      textQuery: hint.name,
      maxResultCount: 1,
      ...(hint.lat != null && hint.lng != null
        ? { locationBias: { circle: { center: { latitude: hint.lat, longitude: hint.lng }, radius: 500 } } }
        : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const p = (await res.json()).places?.[0];
  if (!p) return null;
  const comps: { longText: string; types: string[] }[] = p.addressComponents || [];
  const comp = (...types: string[]) => types.map(t => comps.find(c => c.types.includes(t))?.longText).find(Boolean) || '';
  const types: string[] = [p.primaryType, ...(p.types || [])].filter(Boolean);
  const category = types.map(t => TYPE_CATEGORY.find(([re]) => re.test(t))?.[1]).find(Boolean) || 'other';
  return {
    title: p.displayName?.text || hint.name,
    category,
    // Taiwan and Japan addresses carry no `locality`; the admin areas stand in.
    area: [...new Set([
      comp('neighborhood', 'sublocality_level_1', 'sublocality', 'administrative_area_level_2'),
      comp('locality', 'administrative_area_level_1'),
    ].filter(Boolean))].join(', '),
    address: p.formattedAddress || '',
    note: p.editorialSummary?.text || '',
    country: comp('country'),
    map_url: p.googleMapsUri || '',
  };
}

export const geminiService = {
  async getItineraryAdvice(spotName: string, country: string): Promise<string> {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `我正在規劃去 ${country} 旅遊，地點是「${spotName}」。請判斷類型並提供建議。

只回傳以下 JSON，不加任何說明或 markdown code block：
{"type":"restaurant|cafe|landmark|shopping|other","headline":"20字內核心一句話","tips":["建議1","建議2","建議3"]}

類型判斷與建議方向：
- restaurant（餐廳/居酒屋/壽司等）：招牌料理、必點菜色、是否需要排隊或預約
- cafe（咖啡廳/甜點店/麵包店）：招牌飲品或甜點、限定品、打卡重點
- landmark（神社/寺廟/公園/博物館/城市景點）：歷史背景簡介、必看亮點、最佳拍照位置或時間
- shopping（商店/百貨/市場）：招牌或限定商品、價位、必買清單
- other（其他）：最實用的訪客建議

headline 與每條 tips 都用 ${outLang()}，tips 每條 25 字以內（英文約 15 words）。`,
      config: { responseMimeType: "application/json" },
    });
    return response.text?.trim() || '';
  },

  /**
   * Every flight leg in a booking confirmation, itinerary or boarding pass.
   * Always an array: a round trip with a connection each way is four legs, and
   * asking for "the flight" used to return only the first of them.
   */
  async parseFlights(text: string, imageBase64?: string, mimeType?: string): Promise<any[]> {
    const parts: any[] = [{ text: `你是一個專業的旅遊助手。請從以下資訊中提取所有航班。訂位確認信常常有多段（轉機、去程與回程），每一段都要各自列成一筆，依起飛時間排序；同一段不要重複列。\n"${text}"\n所有時間一律轉成 24 小時制 HH:MM（00:00–23:59）。下午／傍晚／晚上的時間請加 12 小時，例如下午 2:30 PM = 14:30、晚上 11:50 PM = 23:50、中午 12:00 PM = 12:00、凌晨 12:30 AM = 00:30。` }];
    if (imageBase64 && mimeType) {
      parts.push({ inlineData: { data: imageBase64, mimeType } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
           flights: {
            type: Type.ARRAY,
            items: {
          type: Type.OBJECT,
          properties: {
            flightNo: { type: Type.STRING },
            departureAirport: { type: Type.STRING },
            departureTime: { type: Type.STRING, description: "24-hour format HH:MM (00:00-23:59), e.g. 2:30 PM = 14:30. Local time AT THE DEPARTURE AIRPORT, exactly as printed on the ticket - do not convert it." },
            departureTimeZone: { type: Type.STRING, description: "IANA time zone of the DEPARTURE airport, e.g. Asia/Taipei. Must be a real IANA name, never an abbreviation like JST." },
            arrivalAirport: { type: Type.STRING },
            arrivalTime: { type: Type.STRING, description: "24-hour format HH:MM (00:00-23:59), e.g. 2:30 PM = 14:30. Local time AT THE ARRIVAL airport, exactly as printed - do not convert it." },
            arrivalTimeZone: { type: Type.STRING, description: "IANA time zone of the ARRIVAL airport, e.g. Asia/Tokyo. Must be a real IANA name, never an abbreviation like JST." },
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
          },
          required: ["flightNo", "departureAirport", "departureTime", "arrivalAirport", "arrivalTime", "date"],
            },
           },
          },
          required: ["flights"],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{"flights":[]}');
    return Array.isArray(parsed.flights) ? parsed.flights : [];
  },

  async parseAccommodationInfo(text: string, imageBase64?: string, mimeType?: string) {
    const parts: any[] = [{ text: `你是一個專業的旅遊助手。請從以下資訊中提取住宿資訊：\n"${text}"` }];
    if (imageBase64 && mimeType) {
      parts.push({ inlineData: { data: imageBase64, mimeType } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            address: { type: Type.STRING },
            check_in: { type: Type.STRING, description: "YYYY-MM-DD" },
            check_out: { type: Type.STRING, description: "YYYY-MM-DD" },
          },
          required: ["name", "address", "check_in", "check_out"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  },

  async analyzeReceipt(base64Image: string, mimeType: string) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: "請分析這張收據，並提取項目名稱、金額、類別（交通/住宿/飲食/購物/其他）和日期。" },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            item: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            category: { type: Type.STRING },
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
          },
          required: ["item", "amount", "category", "date"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  },

  async parseActivityInfo(text: string, imageBase64?: string, mimeType?: string) {
    const parts: any[] = [{ text: `你是一個專業的旅遊助手。請從以下資訊中提取單一活動行程資訊：\n"${text}"\n如果資訊中沒有明確的日期或時間，請留空或根據上下文推測最合理的數值。所有時間一律轉成 24 小時制 HH:MM（00:00–23:59），下午／傍晚／晚上請加 12 小時，例如下午 2:30 PM = 14:30。` }];
    if (imageBase64 && mimeType) {
      parts.push({ inlineData: { data: imageBase64, mimeType } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            activity: { type: Type.STRING, description: "活動名稱" },
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
            start_time: { type: Type.STRING, description: "24-hour format HH:MM (00:00-23:59), e.g. 2:30 PM = 14:30" },
            end_time: { type: Type.STRING, description: "24-hour format HH:MM (00:00-23:59), e.g. 2:30 PM = 14:30" },
            note: { type: Type.STRING, description: "備註或細節" },
            map_url: { type: Type.STRING, description: "Google Maps URL if available" },
          },
          required: ["activity"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  },

  async translateItinerary(data: any) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are a professional translator. Please translate the following travel itinerary data from Chinese to English. 
      The output must be a valid JSON object with the exact same structure as the input. 
      Translate all descriptive text (names, notes, activities, addresses, etc.) to English. 
      Keep dates, times, and URLs as they are.
      
      Input Data:
      ${JSON.stringify(data)}`,
      config: {
        responseMimeType: "application/json",
      },
    });
    return JSON.parse(response.text || "{}");
  },

  /**
   * A cover photo for a whole trip: the best-known sight of the place it is
   * mainly about, verified to be in the trip's country.
   *
   * The check is on the Places result's country component, not on text: a
   * search for a landmark name alone can land on a same-named restaurant in
   * another country, and a cover of the wrong nation is worse than none. When
   * the specific landmark fails, "<country> famous landmark" is the fallback.
   */
  async getCoverPhoto(tripName: string, country: string): Promise<string> {
    const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!mapsKey) return '';
    const countryEn = country.match(/\(([^)]+)\)/)?.[1] || country;
    const code = countryCode(country);

    let landmark = '';
    try {
      const q = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `旅程名稱：「${tripName}」，國家：${countryEn}。
這趟旅程主要去的是哪個城市或地區？請回傳一行英文 Google Maps 搜尋字串，指向那裡最具代表性、最適合當旅程封面照的地標或自然景觀——跟旅程主題相符（登山行程就選那座山，城市行程就選代表性建築）。例如 "Palacio de Bellas Artes, Mexico City"、"Mount Kilimanjaro"。只回傳搜尋字串，不要任何說明。`,
      });
      landmark = (q.text?.trim() || '').replace(/\s+/g, ' ').slice(0, 150);
    } catch (err) {
      console.warn('[cover] landmark query failed', err);
    }

    for (const textQuery of [landmark, `${countryEn} famous landmark`].filter(Boolean)) {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': mapsKey,
            'X-Goog-FieldMask': 'places.photos,places.addressComponents',
          },
          body: JSON.stringify({ textQuery, languageCode: 'en', maxResultCount: 3 }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const places: any[] = (await res.json()).places ?? [];
        const place = places.find(p =>
          p.photos?.length &&
          (!code || p.addressComponents?.some((c: any) => c.types?.includes('country') && c.shortText === code)),
        );
        if (!place) continue;
        const photoRes = await fetch(
          `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxWidthPx=1200&skipHttpRedirect=true&key=${mapsKey}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (photoRes.ok) {
          const uri = (await photoRes.json()).photoUri;
          if (uri) return uri as string;
        }
      } catch (err) {
        console.warn('[cover] places lookup failed', err);
      }
    }
    return '';
  },

  /**
   * Getting between an airport and the lodging: taxi/rideshare and public
   * transport, with time, cost in local currency, and one practical tip.
   */
  async getAirportTransfer(p: {
    direction: 'arrive' | 'depart';
    airport: string;
    address: string;
    country: string;
    time: string;
  }) {
    const route = p.direction === 'arrive' ? `從機場 ${p.airport} 到住宿「${p.address}」` : `從住宿「${p.address}」到機場 ${p.airport}`;
    const when = p.direction === 'arrive' ? `航班 ${p.time} 抵達` : `航班 ${p.time} 起飛`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `旅遊國家：${p.country}。${route}，${when}。
請估算兩種方式的交通時間與費用（費用用當地貨幣，給範圍）：
1. 計程車或 Uber／叫車
2. 大眾運輸（地鐵、機場巴士、Metrobús 之類）。如果那個時段已經沒有班次、或帶行李搭非常不實際，transit 給 null。
另外給一句最實用的提醒（例如機場官方計程車櫃台、要避開的排班車、尖峰時段塞車）。
文字用${outLang()}，地名保留原文。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            taxi: {
              type: Type.OBJECT,
              properties: {
                minutes: { type: Type.NUMBER, description: "一般路況的分鐘數" },
                cost: { type: Type.STRING, description: "例如 MXN 250–350" },
              },
              required: ["minutes", "cost"],
            },
            transit: {
              type: Type.OBJECT,
              nullable: true,
              properties: {
                minutes: { type: Type.NUMBER },
                cost: { type: Type.STRING },
                route: { type: Type.STRING, description: "一句話路線，例如 Metrobús 4 號線到 Buenavista 轉…" },
              },
              required: ["minutes", "cost", "route"],
            },
            tip: { type: Type.STRING },
          },
          required: ["taxi", "tip"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  },

  async getActivityPhoto(activityName: string, country: string): Promise<string> {
    const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

    // ── Step 1: Google Places API (New) — most accurate ─────────────────
    if (mapsKey) {
      try {
        // Ask Gemini to build the best Google Maps search query for this place
        const qRes = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `以下是旅遊行程名稱：「${activityName}」，所在國家／城市：${country}。
請只回傳一行最適合在 Google Maps 搜尋此地點的查詢字串（保留地點原文名稱，加上所在城市，不要任何說明或標點以外的內容）。
範例：築地場外市場 東京 / Senso-ji Temple Asakusa Tokyo / Échiré Azabudai Hills 東京`,
        });
        const searchQuery = (qRes.text?.trim() || `${activityName} ${country}`)
          .replace(/\n/g, ' ')
          .slice(0, 200);

        // Text Search → get photo name
        const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': mapsKey,
            'X-Goog-FieldMask': 'places.photos',
          },
          body: JSON.stringify({
            textQuery: searchQuery,
            languageCode: 'zh-TW',
            maxResultCount: 1,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (placesRes.ok) {
          const placesData = await placesRes.json();
          const photoName: string | undefined = placesData.places?.[0]?.photos?.[0]?.name;
          if (photoName) {
            // Fetch the actual CDN URL (skipHttpRedirect returns JSON with photoUri)
            const photoRes = await fetch(
              `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true&key=${mapsKey}`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (photoRes.ok) {
              const photoData = await photoRes.json();
              if (photoData.photoUri) return photoData.photoUri as string;
            }
          }
        }
      } catch (err) {
        console.warn('[Places API] photo fetch failed, falling back to Wikipedia:', err);
      }
    }

    // ── Step 2: Wikipedia fallback (no key required) ─────────────────────
    const tryWikipedia = async (lang: string, query: string): Promise<string> => {
      try {
        const searchRes = await fetch(
          `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (!searchRes.ok) return '';
        const searchData = await searchRes.json();
        const title = searchData.query?.search?.[0]?.title;
        if (!title) return '';
        const imgRes = await fetch(
          `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=600&format=json&origin=*`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (!imgRes.ok) return '';
        const imgData = await imgRes.json();
        const pages = imgData.query?.pages || {};
        const page: any = Object.values(pages)[0];
        return page?.thumbnail?.source || '';
      } catch {
        return '';
      }
    };

    const cleaned = activityName.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim();
    const jpSegments: string[] = (cleaned.match(/[\u3040-\u30FF\u4E00-\u9FFF][\u3040-\u30FF\u4E00-\u9FFF\s]*/g) || []);
    const bestJp = jpSegments.sort((a, b) => b.length - a.length)[0]?.trim();
    if (bestJp) {
      const jaPhoto = await tryWikipedia('ja', bestJp);
      if (jaPhoto) return jaPhoto;
    }
    const enSegment = cleaned.replace(/[\u3040-\u9FFF]/g, '').replace(/\s+/g, ' ').trim();
    if (enSegment) {
      const enPhoto = await tryWikipedia('en', `${enSegment} ${country}`);
      if (enPhoto) return enPhoto;
    }

    return '';
  },

  async getDailyNeedSuggestion(
    need: string,
    activities: { start_time: string; end_time: string; activity: string }[],
    country: string,
    date: string,
  ): Promise<string> {
    const schedule = activities.length > 0
      ? activities.map(a => `${a.start_time}–${a.end_time}: ${a.activity}`).join('\n')
      : '（當天尚無行程）';
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `你是一個熟悉當地的旅遊達人。以下是用戶 ${date} 在 ${country} 的行程安排：
${schedule}

用戶今日需求：「${need}」

請根據行程安排（考慮地點順路性、時間空檔），推薦一個最適合的地點。
只回傳以下 JSON，不加任何說明或 markdown：
{"place":"地點完整名稱（保留日文/英文原名）","area":"所在區域或最近地鐵站","suggestedTime":"建議前往時間 HH:MM","reason":"為何選此時段與地點（30字以內，${outLang()}）","mapQuery":"適合 Google Maps 搜尋的字串"}`,
      config: { responseMimeType: "application/json" },
    });
    return response.text?.trim() || '';
  },

  async getTravelTime(origin: string, destination: string, country: string, mode: string) {
    const modeText = mode === 'transit' ? '地鐵/大眾運輸' : mode === 'walking' ? '步行' : '計程車/開車';
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `請估算在${country}，從「${origin}」到「${destination}」，以${modeText}方式的交通時間和距離。
      只回傳以下格式的文字，不需要其他說明：${getLang() === 'en' ? '「~X min (X.X km)」' : '「約X分鐘 (X.Xkm)」'}
      如果步行距離少於1公里則建議步行。`,
    });
    return response.text?.trim() || '';
  },

  /**
   * Read a whole itinerary out of an uploaded file.
   *
   * Two things about real itinerary documents drive this shape. They are
   * written as "Day One / Day Two", not calendar dates, so the schema below
   * numbers days from 1 and leaves start_date empty unless the document states
   * one — the caller asks the user for a departure date and derives the rest.
   * And they describe rather than schedule ("group dinner at the hotel"), so
   * times have to be plausible inventions, which is exactly why nothing here
   * writes to Firestore: the caller shows it all for review first.
   *
   * `countries` is injected rather than described, because the returned label
   * is stored in trip.country and is the key into TIMEZONE_MAP and
   * CURRENCY_MAP. A free-form answer like "Tanzania" would miss both and the
   * trip would silently get Taipei times.
   */
  async parseItineraryFile(
    fileBase64: string,
    mimeType: string,
    countries: string[],
  ) {
    const countryLines = countries.map((c) => '   - ' + c).join('\n');
    const prompt = `你是一個專業的旅遊助手。這個檔案是一份旅遊行程表或行程手冊，請把它整理成結構化資料。

規則：
1. 「國家」必須從下面這個清單裡挑一個最接近的，原文照抄、不要改寫：
${countryLines}
   如果行程跨越多個國家，挑停留最久的那一個。
2. 用「第幾天」而不是日期：day 從 1 開始。只有在文件裡明確寫出西元日期時，才填 start_date（YYYY-MM-DD）；沒寫就留空字串。
3. 每一天列出當天的活動。時間一律 24 小時制 HH:MM，而且分鐘只能是 00 或 30。
4. 文件通常不會寫確切時間。這種情況請依照活動性質給合理的時間（早餐 08:00、Safari 一整天 08:00-17:00、晚餐 19:00 之類），同一天的活動不要重疊、依先後排序。
5. **不要發明文件裡沒有的活動。** 寧可一天只有兩筆，也不要補滿。
6. activity 用簡短的名稱（20 字內），細節放 note。note 可以留空。
7. 住宿只有在文件明確提到旅館／營地名稱時才填。check_in_day / check_out_day 是第幾天（數字）。
8. checklist 只收「出發前要自己準備或攜帶的東西」—— 轉接頭、藥品、衣物、簽證、要先預約的項目之類，一項一句、寫成待辦的口氣。
   **不要**把「此行程不包含 X」「費用不含 Y」這種排除項寫進 checklist：那是報價範圍，不是你要準備的東西，放進來會讓清單變成一串不能勾掉的句子。同理，也不要收錄行程當天才發生的事（那些已經在 activities 裡）。沒有就給空陣列。
9. 全部用${outLang()}輸出，地名與旅館名可以保留原文。`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ text: prompt }, { inlineData: { data: fileBase64, mimeType } }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "行程名稱，20 字內" },
            country: { type: Type.STRING, description: "必須原文照抄使用者提供的國家清單其中一項" },
            start_date: { type: Type.STRING, description: "YYYY-MM-DD，文件沒寫就給空字串" },
            day_count: { type: Type.NUMBER, description: "總天數" },
            days: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.NUMBER, description: "第幾天，從 1 開始" },
                  activities: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        activity: { type: Type.STRING },
                        start_time: { type: Type.STRING, description: "HH:MM，分鐘只能是 00 或 30" },
                        end_time: { type: Type.STRING, description: "HH:MM，分鐘只能是 00 或 30" },
                        note: { type: Type.STRING },
                      },
                      required: ["activity", "start_time", "end_time"],
                    },
                  },
                },
                required: ["day", "activities"],
              },
            },
            accommodations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  address: { type: Type.STRING },
                  check_in_day: { type: Type.NUMBER },
                  check_out_day: { type: Type.NUMBER },
                },
                required: ["name", "check_in_day", "check_out_day"],
              },
            },
            checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["name", "country", "day_count", "days"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  },
  /**
   * Pull candidate places out of whatever someone pasted in.
   *
   * The input is a blog post, a listicle, a Google Maps share, a friend's
   * message — prose that mentions places rather than a list of them. Nothing
   * here writes to Firestore: the caller shows the candidates for review,
   * because a travel article names a dozen places it is not recommending
   * (the one the author skipped, the station they changed at) and only a
   * person can tell those apart.
   */
  /**
   * Google Maps links in pasted text, resolved to places.
   *
   * A long link carries the name and coordinates in its path. A short
   * maps.app.goo.gl link is only a redirect, and the browser cannot read a
   * cross-origin redirect, so Gemini's urlContext fetches it server-side.
   * Places Text Search then turns the name into the real listing — address,
   * type (for the category) and a canonical Maps link.
   */
  async placesFromMapLinks(text: string): Promise<MapPlace[]> {
    const links = [...new Set(text.match(MAPS_LINK_RE) || [])].slice(0, 15);
    const out: MapPlace[] = [];
    for (const link of links) {
      let hint = parseLongMapsUrl(link);
      if (!hint) {
        try {
          const r = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Open this Google Maps link and tell me which place it points to. Reply with one line of JSON only, no prose: {"name": "...", "lat": 0, "lng": 0}. Use null for anything you cannot find.\n${link}`,
            config: { tools: [{ urlContext: {} }] },
          });
          const m = (r.text || '').match(/\{[^{}]*\}/);
          const j = m ? JSON.parse(m[0]) : null;
          if (j?.name) hint = { name: String(j.name), lat: typeof j.lat === 'number' ? j.lat : undefined, lng: typeof j.lng === 'number' ? j.lng : undefined };
        } catch (err) {
          console.error('maps link', link, err);
        }
      }
      if (!hint) continue;
      out.push((await lookupPlace(hint)) ?? { title: hint.name, category: 'other', area: '', address: '', note: '', country: '', map_url: link });
    }
    return out;
  },

  async extractIdeasFromText(text: string, country: string, existingTitles: string[] = []) {
    const already = existingTitles.length > 0
      ? `\n\n收藏區裡已經有這些地點，重複的請不要再列出來：\n${existingTitles.map(t => '- ' + t).join('\n')}`
      : '';

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `你是一個熟悉 ${country} 的旅遊達人。以下是使用者從網站、部落格或朋友訊息複製來的文字，請從中挑出「值得去的具體地點」。

規則：
1. 只收**具體的地點**（店名、景點名、設施名）。不要收城市名、區域名、交通方式、或「可以逛逛街」這種沒有指名的描述。
2. 地點名稱保留當地原文（日文漢字、英文店名照抄），不要翻譯成中文。
3. 文章提到但**作者沒有推薦**的（例如「這家我們沒去」「只是轉車經過」），不要收。
4. note 用${outLang()}寫一句話，說明為什麼值得去 —— 從原文擷取重點，不要自己編造原文沒有的賣點。
5. duration 用${outLang()}給一個合理的停留時間估計（例如「30 分鐘」「1-2 小時」「半天」）。
6. area 填所在區域或最近的車站；原文沒寫就依你的知識補，不確定就留空字串。
7. 最多 15 個。寧可少，不要硬湊。${already}

以下是文字內容：
"""
${text.slice(0, 20000)}
"""`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ideas: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "地點名稱，保留原文" },
                  category: { type: Type.STRING, description: "restaurant | cafe | bar | landmark | shopping | other" },
                  area: { type: Type.STRING, description: "區域或最近車站；不確定就空字串" },
                  note: { type: Type.STRING, description: `一句話說明為何值得去，${outLang()}，30 字內` },
                  duration: { type: Type.STRING, description: "建議停留時間，例如 1-2 小時" },
                },
                required: ["title", "category", "note"],
              },
            },
          },
          required: ["ideas"],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{"ideas":[]}');
    return Array.isArray(parsed.ideas) ? parsed.ideas : [];
  },

  /**
   * Suggest which day each stashed idea belongs on.
   *
   * Returns one entry per idea it has an opinion about — fewer than were sent
   * is a valid answer, and an idea it cannot place is more honest than a day
   * picked to fill the table.
   *
   * `ref` is the 1-based position in the list that was sent, and the caller
   * maps it back by index. An earlier version asked the model to echo the
   * title verbatim and matched on that; it answered
   * `Bar Casa Dani（Mercado de la Paz）` — the title plus the area, because
   * that is how the list below renders each line — and every suggestion was
   * silently dropped as unmatched. A number has no formatting for the model to
   * helpfully improve on.
   */
  async getStashSuggestions(
    trip: { country: string; start_date: string; end_date: string },
    dayPlans: { date: string; day: number; activities: string[] }[],
    ideas: { title: string; area?: string; category: string; duration?: string }[],
  ) {
    const schedule = dayPlans
      .map(d => `Day ${d.day}（${d.date}）：${d.activities.length > 0 ? d.activities.join('、') : '目前空白'}`)
      .join('\n');
    const stash = ideas
      .map((i, n) => `${n + 1}. ${i.title}${i.area ? `（${i.area}）` : ''}${i.duration ? ` · 約 ${i.duration}` : ''}`)
      .join('\n');

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `你是一個專業的旅遊規劃師。使用者在 ${trip.country} 的旅程是 ${trip.start_date} 到 ${trip.end_date}。

目前每天的行程：
${schedule}

使用者收藏了以下還沒安排的地點：
${stash}

請判斷每個收藏地點最適合塞進哪一天，依據是：地理位置跟那天其他行程順不順路、那天時間鬆不鬆、以及這類地點適合的時段（餐廳對用餐時間、景點對白天、夜景對晚上）。

規則：
1. ref 填上面清單的**編號數字**（1、2、3…），不要填地點名稱。
2. 真的找不到合適的日子就不要列入，列得少沒關係。
3. 同一天不要塞超過兩個新地點。
4. reason 用${outLang()}，35 字以內，要講出具體理由（順路、那天空、時段合適），不要講空話。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  ref: { type: Type.NUMBER, description: "收藏清單的編號，從 1 開始" },
                  date: { type: Type.STRING, description: "YYYY-MM-DD，必須落在旅程日期範圍內" },
                  suggestedTime: { type: Type.STRING, description: "建議時間 HH:MM" },
                  reason: { type: Type.STRING, description: `${outLang()}，35 字內` },
                },
                required: ["ref", "date", "reason"],
              },
            },
          },
          required: ["suggestions"],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{"suggestions":[]}');
    return Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  },

  async getItinerarySuggestion(trip: any, activities: any[], question: string) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `你是一個專業的旅遊規劃師。使用者正在規劃一個去 ${trip.country} 的旅程 (${trip.start_date} 到 ${trip.end_date})。
      
      目前的行程安排如下：
      ${JSON.stringify(activities.map(a => `${a.date} ${a.start_time}-${a.end_time}: ${a.activity}`))}

      使用者的問題是：
      "${question}"

      請根據現有的行程安排，分析時間空檔、地理位置順路程度，給出具體的建議。
      如果建議安排在某一天，請說明原因（例如：那天剛好在附近、那天行程較鬆等）。
      請用${outLang()}回答，語氣親切專業。`,
    });
    return response.text;
  },
};
