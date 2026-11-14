// lib/fake-generator.ts
// Self-contained fake perex generator with dual AI providers, quality guards & retry logic.
// No external service needed — just GEMINI_API_KEY and/or GROQ_API_KEY in env.

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

// ── Config ──────────────────────────────────────────────────
const GEMINI_2_5_FLASH_MODEL = "gemini-2.5-flash";
const GEMINI_2_5_PRO_MODEL = "gemini-2.5-pro";
const GEMINI_2_0_FLASH_MODEL = "gemini-2.0-flash";
const GEMINI_2_0_FLASH_LITE_MODEL = "gemini-2.0-flash-lite";
const GEMINI_3_0_FLASH_MODEL = "gemini-3-flash-preview";
const GEMINI_2_5_FLASH_LITE_MODEL = "gemini-2.5-flash-lite";
const GEMINI_3_1_PRO_MODEL = "gemini-3.1-pro-preview";
const GEMINI_3_1_FLASH_LITE_MODEL = "gemini-3.1-flash-lite-preview";
const GEMMA_3_27B_MODEL = "gemma-3-27b-it";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_RETRIES = 2; // reduced from 3 — fewer retries = fewer API calls per article

export type AIProvider =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-2.0-flash"
  | "gemini-2.0-flash-lite"
  | "gemini-3.0-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-3.1-pro"
  | "gemini-3.1-flash-lite"
  | "gemma-3-27b"
  | "groq";

// ── Rate-limit-aware delays (ms) ──────────────────────────────────────────
// Gemini free tier: ~15 RPM → need ~4s between calls
// Groq free tier:   ~30 RPM → need ~2s between calls
const PROVIDER_DELAY: Record<AIProvider, number> = {
  "gemini-2.5-flash": 4000,
  "gemini-2.5-pro": 4000,
  "gemini-2.0-flash": 4000,
  "gemini-2.0-flash-lite": 4000,
  "gemini-3.0-flash": 4000,
  "gemini-2.5-flash-lite": 4000,
  "gemini-3.1-pro": 4000,
  "gemini-3.1-flash-lite": 4000,
  "gemma-3-27b": 4000,
  "groq": 2000,
};

/** Delay helper — used between quality-retry attempts */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Disinformation technique catalog ────────────────────────
// Each technique forces the AI to use a SPECIFIC manipulation strategy,
// preventing it from always falling back to "swap a name/institution".

interface DisinfoTechnique {
  id: string;
  name: string;
  instruction: string;
  example: string;
}

const DISINFO_TECHNIQUES: DisinfoTechnique[] = [
  {
    id: "false_causality",
    name: "Falešná kauzalita",
    instruction:
      "Zachovej VŠECHNA jména, instituce i čísla z originálu. Místo toho VYMYSLI falešnou PŘÍČINU nebo DŮSLEDEK událostí. Propoj dvě nesouvisející věci jako příčinu a následek.",
    example:
      'Originál: "Nezaměstnanost klesla na 3,2 %." → Fake: "Nezaměstnanost klesla na 3,2 %, což ekonomové spojují s masivním odlivem pracovní síly do zahraničí, nikoli s tvorbou nových míst."',
  },
  {
    id: "shifted_context",
    name: "Vytržení z kontextu / posunutý kontext",
    instruction:
      "Zachovej klíčová fakta z originálu, ale PŘIDEJ zcela jiný kontext, který mění vyznění. Například přidej falešnou podmínku, výjimku nebo pozadí, které změní interpretaci.",
    example:
      'Originál: "Vláda schválila novelu zvyšující rodičovský příspěvek." → Fake: "Vláda schválila novelu zvyšující rodičovský příspěvek, ovšem nárok na něj nově ztratí rodiče s příjmem nad 45 tisíc, což se dotkne třetiny rodin."',
  },
  {
    id: "inverted_tone",
    name: "Obrácené vyznění",
    instruction:
      "Vezmi STEJNOU událost a OBRAŤ její vyznění — pozitivní zprávu prezentuj jako hrozbu, negativní jako úspěch. Zachovej co nejvíce reálných detailů, jen změň ZÁVĚR nebo HODNOCENÍ.",
    example:
      'Originál: "Kvalita ovzduší v Praze se meziročně zlepšila o 12 %." → Fake: "Kvalita ovzduší v Praze se sice meziročně zlepšila o 12 %, odborníci ale varují, že jde o statistický artefakt způsobený změnou měřicích stanic."',
  },
  {
    id: "false_statistics",
    name: "Falešná statistika / manipulace s čísly",
    instruction:
      "Zachovej téma a jména. ZMĚŇ klíčová čísla, statistiky nebo data tak, aby podporovala jiný závěr. Posuň procenta, datum, počet — ne absurdně, ale tak aby to měnilo celkový obraz.",
    example:
      'Originál: "Podle průzkumu 62 % Čechů důvěřuje veřejnoprávním médiím." → Fake: "Podle průzkumu už jen 38 % Čechů důvěřuje veřejnoprávním médiím, což je nejnižší číslo od roku 2007."',
  },
  {
    id: "exaggeration",
    name: "Přehánění / dramatizace",
    instruction:
      "Zachovej reálné jádro zprávy, ale PŘEŽEŇ její dopad nebo důsledky. Malý problém prezentuj jako krizi, drobnou změnu jako zásadní zlom. Nepřidávej nové instituce ani jména.",
    example:
      'Originál: "Ceny energií vzrostly o 5 %." → Fake: "Ceny energií vzrostly o 5 %, což podle odhadů uvrhne až 200 tisíc domácností do energetické chudoby ještě před zimou."',
  },
  {
    id: "false_authority",
    name: "Falešná autorita s reálným kontextem",
    instruction:
      "Zachovej téma původní zprávy. Přidej citaci od vymyšleného experta, ale klíčové je, že expert musí ZPOCHYBŇOVAT nebo PŘIDÁVAT NOVÝ ÚHEL k reálné informaci — ne jen opakovat totéž jinými slovy.",
    example:
      'Originál: "Česko vstoupilo do projektu společné evropské obrany." → Fake: "Bezpečnostní analytik Martin Šulc z Ústavu strategických studií upozorňuje, že vstup Česka do projektu společné evropské obrany fakticky znamená ztrátu suverenity nad nasazením armády."',
  },
  {
    id: "missing_context",
    name: "Záměrně vynechaný kontext",
    instruction:
      "Převezmi informace z originálu, ale VYNECH klíčový kontext, který by zprávu vysvětlil. Výsledek by měl vypadat jako reálný článek, ale vzbuzovat falešný dojem kvůli chybějící informaci.",
    example:
      'Originál: "Počet trestných činů vzrostl o 8 %, ale jde hlavně o drobné krádeže." → Fake: "Počet trestných činů v ČR vzrostl o 8 %, kriminalisté hovoří o znepokojivém trendu v celé střední Evropě."',
  },
  {
    id: "false_comparison",
    name: "Zavádějící srovnání",
    instruction:
      "Zachovej původní zprávu, ale přidej FALEŠNÉ SROVNÁNÍ s jinou zemí, obdobím nebo skupinou, které vyznění zprávy dramaticky mění. Srovnávaná data si vymysli.",
    example:
      'Originál: "ČR má 4. nejnižší nezaměstnanost v EU." → Fake: "Nezaměstnanost v ČR sice patří mezi nejnižší v EU, na rozdíl od Rakouska nebo Dánska ale podíl pracujících chudobou stoupl na dvojnásobek."',
  },
  {
    id: "conspiracy_lite",
    name: "Lehká konspirační narážka",
    instruction:
      "Zachovej reálné téma, ale přidej JEMNÝ náznak, že za událostí stojí skrytý záměr, lobby nebo utajovaný plán. Nepiš hrubou konspiraci — jen jemně naznač pochybnost o motivaci.",
    example:
      'Originál: "Ministerstvo schválilo novou regulaci sociálních sítí." → Fake: "Nová regulace sociálních sítí, kterou ministerstvo schválilo bez veřejné diskuse, podle kritiků suspektně připomíná návrhy, které dlouhodobě prosazují velké technologické firmy."',
  },
  {
    id: "temporal_manipulation",
    name: "Manipulace s časem",
    instruction:
      "Převezmi informace, ale změň ČASOVÝ RÁMEC — udělej z budoucího plánu hotovou věc, z jednorázové události trvalý trend, z návrhu schválený zákon. Nebo přesuň událost v čase.",
    example:
      'Originál: "Vláda zvažuje zavedení nové daně z digitálních služeb." → Fake: "Vláda definitivně schválila novou daň z digitálních služeb, která začne platit od července. Firmy nestihnou upravit systémy."',
  },
];

/** Pick a random disinformation technique */
function pickRandomTechnique(): DisinfoTechnique {
  return DISINFO_TECHNIQUES[Math.floor(Math.random() * DISINFO_TECHNIQUES.length)];
}

/** Pick a random technique, avoiding the given ID (for retries) */
function pickDifferentTechnique(excludeId: string): DisinfoTechnique {
  const candidates = DISINFO_TECHNIQUES.filter((t) => t.id !== excludeId);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export interface FakeResult {
  fakePerex: string;
  explanationPoints: string[];
  fakeSnippet: string;
  fakeSnippetExplanation: string;
  provider: AIProvider;
  model: string;
}

// ── Gemini caller ───────────────────────────────────────────
async function callGeminiJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  modelName: string = GEMINI_2_5_FLASH_MODEL,
  temperature = 0.7
): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Chybí GEMINI_API_KEY v .env.local");

  const ai = new GoogleGenAI({ apiKey: key });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              fakePerex: {
                type: "string",
                description: "Vymyšlený dezinformační perex v češtině",
              },
              fakeSnippet: {
                type: "string",
                description: "Konkrétní krátký úryvek (jedna věta) z fakePerexu, který je dezinformační",
              },
              fakeSnippetExplanation: {
                type: "string",
                description: "Stručné vysvětlení (1-2 věty), proč je fakeSnippet zavádějící nebo nepravdivý",
              },
              explanationPoints: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                maxItems: 3,
                description: "3 body vysvětlující proč je text podezřelý",
              },
            },
            required: ["fakePerex", "fakeSnippet", "fakeSnippetExplanation", "explanationPoints"],
          },
          temperature,
          topP: 0.9,
        },
      });

      const raw = response.text ?? "{}";
      try {
        return JSON.parse(raw) as T;
      } catch {
        console.error("JSON parse failed, raw:", raw);
        throw new Error("Model returned invalid JSON");
      }
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes("429") ||
        err?.message?.includes("RESOURCE_EXHAUSTED");
      if (isRateLimit && attempt < 3) {
        const delay = attempt * 5000;
        console.warn(`[${modelName}] Rate limited, retrying in ${delay / 1000}s…`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${modelName} API: all retries exhausted`);
}

// ── Groq caller ─────────────────────────────────────────────
async function callGroqJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.7
): Promise<T> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Chybí GROQ_API_KEY v .env.local");

  const client = new OpenAI({
    apiKey: key,
    baseURL: "https://api.groq.com/openai/v1",
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature,
        top_p: 0.9,
        max_tokens: 1024,
      });

      const raw = completion.choices?.[0]?.message?.content ?? "{}";
      try {
        return JSON.parse(raw) as T;
      } catch {
        console.error("JSON parse failed, raw:", raw);
        throw new Error("Model returned invalid JSON");
      }
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes("429") ||
        err?.message?.includes("rate_limit");
      if (isRateLimit && attempt < 3) {
        const delay = attempt * 3000;
        console.warn(`[Groq] Rate limited, retrying in ${delay / 1000}s…`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Groq API: all retries exhausted");
}

// ── Unified caller ──────────────────────────────────────────
function callAI<T>(
  provider: AIProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7
): Promise<T> {
  if (provider === "groq") return callGroqJSON<T>(systemPrompt, userPrompt, temperature);
  
  // All other options are Gemini models
  const modelMap: Record<string, string> = {
    "gemini-2.5-flash": GEMINI_2_5_FLASH_MODEL,
    "gemini-2.5-pro": GEMINI_2_5_PRO_MODEL,
    "gemini-2.0-flash": GEMINI_2_0_FLASH_MODEL,
    "gemini-2.0-flash-lite": GEMINI_2_0_FLASH_LITE_MODEL,
    "gemini-3.0-flash": GEMINI_3_0_FLASH_MODEL,
    "gemini-2.5-flash-lite": GEMINI_2_5_FLASH_LITE_MODEL,
    "gemini-3.1-pro": GEMINI_3_1_PRO_MODEL,
    "gemini-3.1-flash-lite": GEMINI_3_1_FLASH_LITE_MODEL,
    "gemma-3-27b": GEMMA_3_27B_MODEL,
  };

  const selectedModel = modelMap[provider] || GEMINI_2_5_FLASH_MODEL;
  return callGeminiJSON<T>(systemPrompt, userPrompt, selectedModel, temperature);
}

// ── Quality helpers ─────────────────────────────────────────

function trigramSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const trigrams = (s: string): Set<string> => {
    const t = new Set<string>();
    const n = norm(s);
    for (let i = 0; i <= n.length - 3; i++) t.add(n.slice(i, i + 3));
    return t;
  };
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

function wordOverlap(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 4);
  const wa = norm(a);
  const wb = new Set(norm(b));
  if (wa.length === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.max(wa.length, wb.size);
}

function hasCzechGrammarIssues(text: string): boolean {
  const issues = [
    /\b[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{3,}\b/g,
    /[!]{2,}/g,
    /\bpokud\s+by\s+by\b/i,
    /\bse\s+se\b/i,
    /\bsi\s+si\b/i,
    /\bže\s+že\b/i,
    /\bale\s+ale\b/i,
    /\ba\s+a\b/i,
    /\bv\s+v\b/i,
    /\bna\s+na\b/i,
    /[.]{4,}/g,
    /\b(very|the|is|are|was|were|been|being|have)\b/i,
    /\b(according|however|moreover|furthermore)\b/i,
  ];
  return issues.some((rx) => rx.test(text));
}

function looksLikeNonsense(text: string): boolean {
  const sentenceCount = text
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 3).length;
  if (sentenceCount > 7) return true;
  const words = text.toLowerCase().split(/\s+/);
  const freq = new Map<string, number>();
  for (const w of words) {
    if (w.length < 4) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  for (const [, count] of freq) {
    if (count >= 4) return true;
  }
  const avgLen =
    words.reduce((sum, w) => sum + w.length, 0) / (words.length || 1);
  if (avgLen < 2.5 || avgLen > 12) return true;
  return false;
}

function explanationReferencesOriginal(points: string[]): boolean {
  const forbidden = [
    /\borig[ií]n[aá]l/i,
    /\bpůvodn[ií]/i,
    /\bre[aá]ln[ýéí]/i,
    /\boproti\s+skutečn/i,
    /\bve\s+skutečnosti\s+(říká|uvádí|je|se)/i,
    /\bv\s+orig/i,
    /\bnaopak\s+(v|je|se|říká|uvádí)/i,
    /\bskutečn[ýéá]\s+(text|perex|článek|zpráva)/i,
  ];
  return points.some((p) => forbidden.some((rx) => rx.test(p)));
}

/**
 * Detects when the fake perex is just a name/institution swap of the original.
 * Compares sentence structure: if most words are identical and only proper nouns changed,
 * it's a lazy name swap and should be rejected.
 */
function looksLikeNameSwapOnly(original: string, fake: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const origWords = normalize(original).split(" ").filter((w) => w.length >= 3);
  const fakeWords = normalize(fake).split(" ").filter((w) => w.length >= 3);

  if (origWords.length === 0 || fakeWords.length === 0) return false;

  // Count how many words from the original appear in the fake (order-independent)
  const fakeSet = new Set(fakeWords);
  let shared = 0;
  for (const w of origWords) {
    if (fakeSet.has(w)) shared++;
  }
  const sharedRatio = shared / origWords.length;

  // If >70% of original words are preserved AND the sentences have similar length,
  // it's likely just a name/institution swap
  const lengthRatio = fakeWords.length / origWords.length;
  if (sharedRatio > 0.70 && lengthRatio > 0.75 && lengthRatio < 1.35) {
    return true;
  }

  return false;
}

// ── System prompt ───────────────────────────────────────────

const SYSTEM_PROMPT = `Jsi zkušený český novinář a expert na mediální manipulaci. Tvoje čeština je BEZCHYBNÁ — píšeš jako rodilý mluvčí. NIKDY nepoužívej angličtiny.

ÚKOL: Dostaneš reálný perex zpravodajského článku. Vytvoř z něj DEZINFORMAČNÍ verzi plnou vymyšlených údajů — ale tak, aby zněla naprosto VĚROHODNĚ a PROFESIONÁLNĚ.

═══════════════════════════════════════════════
VÝSTUPNÍ FORMÁT (striktní JSON, nic jiného):
═══════════════════════════════════════════════
{
  "fakePerex": "...",
  "fakeSnippet": "...",
  "fakeSnippetExplanation": "...",
  "explanationPoints": ["bod 1", "bod 2", "bod 3"]
}

═══════════════════════════════════════════════════════════════
CO CHCI: FALEŠNÉ INFORMACE, KTERÉ ZNÍ REÁLNĚ
═══════════════════════════════════════════════════════════════

Tvůj perex MÁ obsahovat VYMYŠLENÉ ÚDAJE — falešná čísla, falešné studie, falešné důsledky. ALE všechno musí znít tak, jako by to mohl napsat skutečný novinář. Čtenář by si měl říct: "Hmm, to nezní špatně," a ne "To je úplný nesmysl."

PRAVIDLO VĚROHODNOSTI:
Každý vymyšlený údaj musí být UVĚŘITELNÝ pro člověka, který nemá čas si to ověřit. Obecná pravidla:
• Čísla a statistiky posuň mírně, ne absurdně (±5–15 % od reality).
• Nikdy netvrd' něco, co odporuje základnímu všeobecnému přehledu.

═══════════════════════════════════════════════════════════════
⛔ PŘÍSNÝ ZÁKAZ — NESMÍŠ DĚLAT POUHOU ZÁMĚNU JMEN/INSTITUCÍ:
═══════════════════════════════════════════════════════════════

NEJČASTĚJŠÍ CHYBA, které se musíš VYHNOUT: Vzít originální text a POUZE nahradit jméno osoby nebo název instituce za vymyšlený. To NENÍ dezinformace — to je jen přepsání. Příklad ŠPATNÉHO přístupu:
• Originál: „...podle Českého statistického úřadu..." → Fake: „...podle Institutu pro mediální studia..." ← TOHLE JE ZAKÁZÁNO!
• Originál: „...analytik Jan Novák..." → Fake: „...analytik Petr Dvořák..." ← TOHLE JE ZAKÁZÁNO!

Co MUSÍŠ udělat místo toho:
• ZMĚŇ PODSTATU SDĚLENÍ — jiný závěr, jiná příčina, jiný důsledek, jiné vyznění.
• PŘIDEJ FALEŠNÝ KONTEXT — nová informace, která mění celkový obraz.
• OBRAŤ VYZNĚNÍ — pozitivní zprávu udělej negativní (nebo naopak).
• MANIPULUJ S ČÍSLY — ne jen jménem, ale s tím CO se tvrdí.

Jestli chceš přidat vymyšlenou autoritu (experta, instituci), MŮŽEŠ — ale ta autorita musí říkat NĚCO JINÉHO než originál, ne totéž jinými slovy.

PRAVIDLO PRO JMÉNA A INSTITUCE (pokud je použiješ):
• Jména: používej běžná česká jména s konkrétním titulem a pracovištěm. DOBŘE: „sociolog Petr Dvořák z katedry mediálních studií FSV UK". ŠPATNĚ: „expert Jan Novák".
• Instituce: vymyšlený název musí znít jako skutečná organizace. DOBŘE: „Centrum pro digitální gramotnost při MŠMT". ŠPATNĚ: „Institut pro věci".
• Můžeš odkazovat na REÁLNÉ instituce (ČSÚ, UK, ČVUT, WHO, OECD, Eurostat) s vymyšlenými daty.

═══════════════════════════════════════════════════════════════
🎯 POVINNÁ TECHNIKA PRO TENTO ČLÁNEK:
═══════════════════════════════════════════════════════════════
{{TECHNIQUE_PLACEHOLDER}}
MUSÍŠ použít PRÁVĚ tuto techniku. Netvař se, že ji používáš — skutečně ji aplikuj. Pokud by technika k tématu nesedla, adaptuj ji kreativně.

═══════════════════════════════════════════════
PŘÍKLADY Z RŮZNÝCH TÉMAT:
═══════════════════════════════════════════════

[VZDĚLÁVÁNÍ]
Originál: „ČR je v angličtině na 23. místě, Brno vede."
❌ „85 % Čechů neumí anglicky." (absurdní)
✅ „Podle dat Institutu jazykových kompetencí ČR klesla na 31. místo za Slovensko. Lingvistka Markéta Zemanová z FF UK viní zastaralou metodiku." (věrohodné)

[EKONOMIKA]
Originál: „Průměrná mzda v ČR vzrostla na 43 tisíc korun."
❌ „Mzdy klesly o 60 %." (absurdní)
✅ „Ekonom Radek Bureš z CERGE-EI upozorňuje, že reálná kupní síla klesá třetí rok — 43 tisíc po inflaci odpovídá 37 tisícům z roku 2020." (věrohodné)

[ZDRAVOTNICTVÍ]
Originál: „Počet očkovaných proti chřipce vzrostl o 15 %."
❌ „Vakcíny způsobují neplodnost." (konspirační nesmysl)
✅ „Podle WHO riziková skupina 65+ zůstává proočkovaná jen z 23 %, varuje vakcinolog Tomáš Hájek z 3. LF UK." (věrohodné)

[POLITIKA]
Originál: „Vláda schválila novelu zákona o sociálních dávkách."
❌ „Vláda tajně zrušila všechny dávky." (absurdní)
✅ „Analýza Centra pro sociální politiku při MPSV ukazuje, že novela by mohla připravit až 40 tisíc domácností o příspěvek na bydlení." (věrohodné)

[SPORT]
Originál: „Česká tenistka vyhrála turnaj WTA v Dubaji."
❌ „Ukázalo se, že užívala steroidy." (pomluva)
✅ „Podle investigativní novinářky Kláry Dvořákové z Deníku N organizátoři čelí podezření ze sportswashingu." (jiný úhel)

═══════════════════════════════════════════════
TECHNIKY PRO VYTVÁŘENÍ VĚROHODNÝCH DEZINFORMACÍ:
═══════════════════════════════════════════════

1. FALEŠNÉ DETAILY: Vymysli konkrétní jména + pracoviště, instituce, čísla. Čím specifičtější, tím věrohodnější.
2. PŘIDEJ FALEŠNÝ KONTEXT: Vezmi reálné téma a přidej vymyšlený důvod nebo důsledek.
3. FALEŠNÉ SROVNÁNÍ: Srovnej s jinou zemí/městem/obdobím a vymysli si výsledek.
4. ZPOCHYBNI METODIKU: Napadni způsob měření ("průzkum nezahrnoval…").
5. PŘEŽEŇ MALÝ PROBLÉM: Vezmi drobný nedostatek a prezentuj ho jako krizi.
6. FALEŠNÁ AUTORITA: Cituj vymyšleného experta s realistickým jménem a pracovištěm.
7. FALEŠNÁ KAUZALITA: "Důvodem je…" a uveď vymyšlenou příčinu.
8. OBRAŤ VYZNĚNÍ: Původní pozitivní zprávu prezentuj negativně (nebo naopak).
9. VYTRHNI Z KONTEXTU: Cituj jen část a dodej jí jiný význam.

POŽADAVKY NA TEXT:
1. Falešný perex musí být O STEJNÉM TÉMATU jako originál, ale s JINÝMI (vymyšlenými) fakty a závěry.
2. Musí znít jako skutečný článek z iDNES, Novinky.cz nebo Seznam Zprávy.
3. NEPŘEBÍREJ celé fráze z originálu. Piš vlastním stylem.
4. Délka: MAXIMÁLNĚ 2–3 věty. Buď stručný a úderný — jako skutečný perex v online zpravodajství.
5. ŽÁDNÉ vykřičníky, velká písmena, bulvární styl.
6. Zákaz extrémního násilí, genocidy, sexuálního obsahu.
7. Každá věta musí logicky navazovat.
8. Piš POUZE samotný perex — žádné nadpisy, úvody, komentáře.
9. CELÝ perex by měl mít maximálně 50–80 slov. Méně je lépe.

JAZYKOVÁ PRAVIDLA:
- Piš VÝHRADNĚ česky.
- Správná interpunkce, skloňování, časování, slovosled.
- Přirozený jazyk — žádné krkolomné formulace.
- Nepoužívej stejné slovo v sousedních větách.
- Střídej délku vět.

═══════════════════════════════════════════════
VYSVĚTLENÍ (explanationPoints):
═══════════════════════════════════════════════

Pole přesně 3 stringů. Každý bod pomáhá čtenáři ROZPOZNAT manipulaci.

ZÁKAZY:
- NIKDY neporovnávej s originálem. NIKDY nepiš „v originálu", „oproti skutečnosti", „původní text".
- Analyzuj JEN falešný perex — jako by originál neexistoval.

POŽADAVKY:
1. Každý bod: MAXIMÁLNĚ 1–2 krátké věty. Žádné dlouhé odstavce!
2. Stručně řekni: co je podezřelé a jak si to ověřit.
3. Tři body = tři RŮZNÉ manipulativní techniky.
4. Příklad dobrého bodu: "Text cituje neexistující instituci. Vyhledejte si její název na Google."
5. Příklad ŠPATNÉHO (příliš dlouhého) bodu: "Článek se odvolává na ‚Evropské centrum pro jazykové dovednosti' a cituje ‚doktorku Alenu Procházkovou'. Tyto entity a osoba jsou fiktivní, což dodává nepravdivým tvrzením zdání odbornosti…" — TOHLE JE PŘÍLIŠ DLOUHÉ!
6. Každý bod max 30 slov.

PRO fakeSnippet + fakeSnippetExplanation:
1. fakeSnippet musí být doslovný úryvek z fakePerex (ideálně jedna věta, max 25 slov).
2. fakeSnippetExplanation stručně vysvětli, proč je právě tento úryvek zavádějící/nepravdivý.
3. Vysvětlení piš obecně, neporovnávej s „originálem".

═══════════════════════════════════════════════
KRITICKÁ PRAVIDLA:
═══════════════════════════════════════════════
- Uvnitř JSON stringů nepoužívej neescapované dvojité uvozovky — použij „…" nebo \\".
- Výstup je POUZE validní JSON objekt — nic jiného.`;

const FALLBACK_EXPLANATIONS = [
  "Text neuvádí žádný ověřitelný zdroj. Dohledejte si tvrzení na stránkách příslušné instituce.",
  "Článek používá emotivní formulace místo věcného popisu. Všimněte si dramatických slov.",
  "Chybí kontext — není jasné kdy, kde a za jakých podmínek. Porovnejte s dalšími médii.",
  "Uvedená čísla nejsou podložena odkazem na studii. Ověřte na ČSÚ nebo Eurostatu.",
  "Text cituje experta bez ověřitelného pracoviště. Zkuste si jméno dohledat na Google.",
];

// ── Main public function ────────────────────────────────────

export async function generateFakePerex(
  perexReal: string,
  title: string | undefined,
  provider: AIProvider = "gemini-2.0-flash"
): Promise<FakeResult> {
  // Pick a random disinformation technique for this article
  let currentTechnique = pickRandomTechnique();

  const buildSystemPrompt = (technique: DisinfoTechnique): string => {
    const techniqueBlock = `Technika: ${technique.name}\nInstrukce: ${technique.instruction}\nPříklad: ${technique.example}`;
    const base = SYSTEM_PROMPT.replace("{{TECHNIQUE_PLACEHOLDER}}", techniqueBlock);
    return provider === "groq"
      ? base +
        `\n\nDŮLEŽITÉ UPŘESNĚNÍ DÉLKY:
- Falešný perex musí mít 3–5 vět a alespoň 50 slov. Nepiš jen jednu nebo dvě věty — rozveď myšlenku, přidej detail.
- Každý vysvětlovací bod (explanationPoints) musí mít 15–30 slov — ne jen jednu krátkou větu.
- Nesnaž se být minimalistický. Piš, jako bys psal do novin.`
      : base;
  };

  const userPrompt = title
    ? `Název článku: ${title}\n\nOriginální perex:\n${perexReal}`
    : `Originální perex:\n${perexReal}`;

  let fakePerex = "";
  let explanationPoints: string[] = [];
  let fakeSnippet = "";
  let fakeSnippetExplanation = "";
  let attempts = 0;
  let lastRejectReason = "";

  while (attempts <= MAX_RETRIES) {
    attempts++;
    const temp = 0.7 + (attempts - 1) * 0.08;

    // On retry, pick a different technique to get variety
    if (attempts > 1) {
      currentTechnique = pickDifferentTechnique(currentTechnique.id);
    }

    const systemPrompt = buildSystemPrompt(currentTechnique);

    const retryHint =
      attempts > 1
        ? `\n\n[SYSTÉM: Předchozí pokus byl odmítnut — důvod: ${lastRejectReason}. Tentokrát se zaměř na opravu tohoto problému. Piš jinak, jinými slovy, jinou strukturou. Použij techniku: ${currentTechnique.name}.]`
        : "";

    const result = await callAI<{
      fakePerex?: string;
      fakeSnippet?: string;
      fakeSnippetExplanation?: string;
      explanationPoints?: string[];
    }>(provider, systemPrompt, userPrompt + retryHint, temp);

    fakePerex = (result.fakePerex ?? "").trim();
    fakeSnippet = (result.fakeSnippet ?? "").trim();
    fakeSnippetExplanation = (result.fakeSnippetExplanation ?? "").trim();
    explanationPoints = Array.isArray(result.explanationPoints)
      ? result.explanationPoints
          .map((p) =>
            String(p)
              .replace(/^[-\u2013\u2022*\d.)]+\s*/, "")
              .trim()
          )
          .filter((p) => p.length > 10)
      : [];

    // ── Quality checks ──
    const perexWordCount = fakePerex.split(/\s+/).length;
    const issues: string[] = [];

    if (fakePerex.length < 60) issues.push("příliš krátký text");
    if (perexWordCount > 85) issues.push(`příliš dlouhý (${perexWordCount} slov)`);
    if (trigramSimilarity(perexReal, fakePerex) > 0.4)
      issues.push("příliš podobný originálu (trigram)");
    if (wordOverlap(perexReal, fakePerex) > 0.35)
      issues.push("příliš mnoho sdílených slov");
    if (looksLikeNameSwapOnly(perexReal, fakePerex))
      issues.push("pouhá záměna jmen/institucí bez změny podstaty — použij jinou techniku");
    if (explanationPoints.length < 3) issues.push("méně než 3 vysvětlení");
    if (hasCzechGrammarIssues(fakePerex)) issues.push("gramatické problémy");
    if (looksLikeNonsense(fakePerex)) issues.push("nesouvislý text");
    if (explanationReferencesOriginal(explanationPoints))
      issues.push("vysvětlení odkazují na originál");
    if (explanationPoints.some((p) => p.split(/\s+/).length > 35))
      issues.push("vysvětlení příliš dlouhá");
    if (!fakeSnippet) issues.push("chybí fakeSnippet");
    if (!fakeSnippetExplanation) issues.push("chybí fakeSnippetExplanation");
    if (fakeSnippet && !fakePerex.toLowerCase().includes(fakeSnippet.toLowerCase())) {
      issues.push("fakeSnippet není součást fakePerexu");
    }

    if (issues.length > 0) {
      lastRejectReason = issues.join(", ");
      console.warn(
        `[fake-gen] Attempt ${attempts}/${MAX_RETRIES + 1} rejected: ${lastRejectReason}`
      );
      if (attempts <= MAX_RETRIES) {
        // Wait before quality-retry to avoid burning through rate limits
        await sleep(PROVIDER_DELAY[provider]);
        continue;
      }
    }
    break;
  }

  // Strip references to original
  const forbiddenRx = [
    /\borig[ií]n[aá]l/i,
    /\bpůvodn[ií]/i,
    /\bre[aá]ln[ýéí]/i,
    /\boproti\s+skutečn/i,
    /\bve\s+skutečnosti\s+(říká|uvádí|je|se)/i,
    /\bv\s+orig/i,
    /\bskutečn[ýéá]\s+(text|perex|článek|zpráva)/i,
  ];
  explanationPoints = explanationPoints.filter(
    (p) => !forbiddenRx.some((rx) => rx.test(p))
  );

  // Trim long explanations
  explanationPoints = explanationPoints.map((p) => {
    const words = p.split(/\s+/);
    return words.length > 35 ? words.slice(0, 30).join(" ") + "." : p;
  });

  const fallbackSnippetFromPerex = (() => {
    const firstSentence = fakePerex
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .find((s) => s.length > 0);
    return firstSentence || fakePerex;
  })();

  if (!fakeSnippet || !fakePerex.toLowerCase().includes(fakeSnippet.toLowerCase())) {
    fakeSnippet = fallbackSnippetFromPerex;
  }

  if (!fakeSnippetExplanation) {
    fakeSnippetExplanation = explanationPoints[0] ||
      "Tento úryvek používá neověřené tvrzení bez jasného a dohledatelného zdroje.";
  }

  // Guarantee exactly 3 points
  let fbIdx = 0;
  while (explanationPoints.length < 3 && fbIdx < FALLBACK_EXPLANATIONS.length) {
    const fb = FALLBACK_EXPLANATIONS[fbIdx++];
    if (!explanationPoints.includes(fb)) explanationPoints.push(fb);
  }
  explanationPoints = explanationPoints.slice(0, 3);

  return {
    fakePerex,
    explanationPoints,
    fakeSnippet,
    fakeSnippetExplanation,
    provider,
    model: provider === "groq" ? GROQ_MODEL 
         : provider === "gemma-3-27b" ? GEMMA_3_27B_MODEL
         : provider === "gemini-3.1-pro" ? GEMINI_3_1_PRO_MODEL
         : provider === "gemini-2.5-pro" ? GEMINI_2_5_PRO_MODEL
         : provider === "gemini-2.0-flash" ? GEMINI_2_0_FLASH_MODEL
         : provider === "gemini-2.0-flash-lite" ? GEMINI_2_0_FLASH_LITE_MODEL
         : provider === "gemini-3.0-flash" ? GEMINI_3_0_FLASH_MODEL
         : provider === "gemini-2.5-flash-lite" ? GEMINI_2_5_FLASH_LITE_MODEL
         : provider === "gemini-3.1-flash-lite" ? GEMINI_3_1_FLASH_LITE_MODEL
         : GEMINI_2_5_FLASH_MODEL,
  };
}

/**
 * Generate a fake perex with automatic provider fallback.
 * Tries the preferred provider first; on rate-limit (429), switches to the other.
 */
export async function generateFakePerexWithFallback(
  perexReal: string,
  title: string | undefined,
  preferredProvider: AIProvider = "gemini-2.5-flash"
): Promise<FakeResult> {
  try {
    return await generateFakePerex(perexReal, title, preferredProvider);
  } catch (err: any) {
    const isRateLimit =
      err?.status === 429 ||
      err?.message?.includes("429") ||
      err?.message?.includes("RESOURCE_EXHAUSTED") ||
      err?.message?.includes("rate_limit") ||
      err?.message?.includes("retries exhausted");

    if (isRateLimit) {
      const fallback: AIProvider =
        preferredProvider === "groq" ? "gemini-2.5-flash" : "groq";
      console.warn(
        `[fake-gen] ${preferredProvider} rate-limited, falling back to ${fallback}`
      );
      // Wait a bit before hitting the other provider
      await sleep(2000);
      return await generateFakePerex(perexReal, title, fallback);
    }
    throw err;
  }
}

/** Returns the recommended inter-call delay (ms) for a given provider */
export function getProviderDelay(provider: AIProvider): number {
  return PROVIDER_DELAY[provider];
}

