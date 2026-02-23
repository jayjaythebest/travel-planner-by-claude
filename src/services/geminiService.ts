import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const geminiService = {
  async getItineraryAdvice(spotName: string, country: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
      model: "gemini-3-flash-preview",
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
      model: "gemini-3-flash-preview",
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
      model: "gemini-3-flash-preview",
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
};
