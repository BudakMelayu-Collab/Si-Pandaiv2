import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.list();
  for await (const m of response) {
    if (m.name.includes("flash") || m.name.includes("gemini")) {
      console.log(m.name);
    }
  }
}
run().catch(console.error);
