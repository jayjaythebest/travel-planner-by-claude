import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" });

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

每條 tips 25字以內，繁體中文。`,
      config: { responseMimeType: "application/json" },
    });
    return response.text?.trim() || '';
  },

  async parseFlightInfo(text: string, imageBase64?: string, mimeType?: string) {
    const parts: any[] = [{ text: `你是一個專業的旅遊助手。請從以下資訊中提取航班資訊：\n"${text}"` }];
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
            flightNo: { type: Type.STRING },
            departureAirport: { type: Type.STRING },
            departureTime: { type: Type.STRING, description: "HH:MM" },
            arrivalAirport: { type: Type.STRING },
            arrivalTime: { type: Type.STRING, description: "HH:MM" },
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
          },
          required: ["flightNo", "departureAirport", "departureTime", "arrivalAirport", "arrivalTime", "date"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
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
    const parts: any[] = [{ text: `你是一個專業的旅遊助手。請從以下資訊中提取單一活動行程資訊：\n"${text}"\n如果資訊中沒有明確的日期或時間，請留空或根據上下文推測最合理的數值。` }];
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
            start_time: { type: Type.STRING, description: "HH:MM" },
            end_time: { type: Type.STRING, description: "HH:MM" },
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
    const jpSegments = (cleaned.match(/[\u3040-\u30FF\u4E00-\u9FFF][\u3040-\u30FF\u4E00-\u9FFF\s]*/g) || []);
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
{"place":"地點完整名稱（保留日文/英文原名）","area":"所在區域或最近地鐵站","suggestedTime":"建議前往時間 HH:MM","reason":"為何選此時段與地點（30字以內，繁體中文）","mapQuery":"適合 Google Maps 搜尋的字串"}`,
      config: { responseMimeType: "application/json" },
    });
    return response.text?.trim() || '';
  },

  async getTravelTime(origin: string, destination: string, country: string, mode: string) {
    const modeText = mode === 'transit' ? '地鐵/大眾運輸' : mode === 'walking' ? '步行' : '計程車/開車';
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `請估算在${country}，從「${origin}」到「${destination}」，以${modeText}方式的交通時間和距離。
      請以繁體中文簡短回答，只回傳以下格式的文字，不需要其他說明：「約X分鐘 (X.Xkm)」
      如果步行距離少於1公里則建議步行。`,
    });
    return response.text?.trim() || '';
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
      請用繁體中文回答，語氣親切專業。`,
    });
    return response.text;
  },
};
