import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" });

export const geminiService = {
  async getItineraryAdvice(spotName: string, country: string) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: `我正在規劃去 ${country} 旅遊，景點是 ${spotName}。請提供 50 字以內的簡短介紹與建議，像是一定要點那些餐點、看那些東西等等。`,
    });
    return response.text;
  },

  async parseFlightInfo(text: string, imageBase64?: string, mimeType?: string) {
    const parts: any[] = [{ text: `你是一個專業的旅遊助手。請從以下資訊中提取航班資訊：\n"${text}"` }];
    if (imageBase64 && mimeType) {
      parts.push({ inlineData: { data: imageBase64, mimeType } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
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
      model: "gemini-2.5-flash-preview-04-17",
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
      model: "gemini-2.5-flash-preview-04-17",
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
      model: "gemini-2.5-flash-preview-04-17",
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
      model: "gemini-2.5-flash-preview-04-17",
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

  async getItinerarySuggestion(trip: any, activities: any[], question: string) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
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
