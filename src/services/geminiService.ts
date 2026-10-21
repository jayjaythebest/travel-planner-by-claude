import { GoogleGenAI, Type } from "@google/genai";
import { getLang } from "../i18n";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" });

/**
 * The language AI-written text comes back in: whatever the person asking has
 * the UI set to. Results that are stored (advice, travel times, idea notes)
 * keep the language of whoever generated them; regenerating rewrites them.
 */
const outLang = () => (getLang() === 'en' ? 'English' : '繁體中文');

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

  async parseFlightInfo(text: string, imageBase64?: string, mimeType?: string) {
    const parts: any[] = [{ text: `你是一個專業的旅遊助手。請從以下資訊中提取航班資訊：\n"${text}"\n所有時間一律轉成 24 小時制 HH:MM（00:00–23:59）。下午／傍晚／晚上的時間請加 12 小時，例如下午 2:30 PM = 14:30、晚上 11:50 PM = 23:50、中午 12:00 PM = 12:00、凌晨 12:30 AM = 00:30。` }];
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
                  category: { type: Type.STRING, description: "restaurant | cafe | landmark | shopping | other" },
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
