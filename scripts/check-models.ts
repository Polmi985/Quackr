
// @ts-nocheck
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local from the workspace root
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not found in .env.local");
    return;
  }

  try {
    const genAI = new GoogleGenAI({ apiKey });
    const models = await genAI.listModels();
    
    console.log("=== Available Gemini Models ===");
    for (const model of models) {
      console.log(`- ${model.name}`);
      console.log(`  Description: ${model.description}`);
      console.log(`  Methods: ${model.supportedGenerationMethods.join(", ")}`);
      console.log("-------------------------------");
    }
  } catch (error) {
    console.error("Error fetching models:", error);
  }
}

listModels();
