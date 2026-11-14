
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    content.split("\n").forEach(line => {
      const [key, ...valueParts] = line.split("=");
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join("=").trim();
      }
    });
  }
}

async function listModels() {
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not found in .env.local");
    return;
  }

  try {
    // The @google/genai package uses a different structure in newer versions
    // or we might be using the generative-ai package name internally.
    // Let's try the common patterns.
    const genAI = new GoogleGenAI({ apiKey });
    
    // In @google/genai (new SDK), listing might be different. 
    // Let's try to find the list method or just try to generate with a dummy to see error hints if list fails.
    console.log("Attempting to list models...");
    
    // If it's the newer @google/genai SDK:
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    
    if (data.models) {
      console.log("=== Available Gemini Models ===");
      data.models.forEach(model => {
        console.log(`- ${model.name}`);
        console.log(`  Display Name: ${model.displayName}`);
        console.log(`  Methods: ${model.supportedGenerationMethods.join(", ")}`);
        console.log("-------------------------------");
      });
    } else {
      console.log("No models found in response:", JSON.stringify(data));
    }
  } catch (error) {
    console.error("Error fetching models:", error.message);
  }
}

listModels();
