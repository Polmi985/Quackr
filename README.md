# Quackr 🦆

> Swipuj zprávy, odhal fake news a otestuj svou intuici.

Quackr je webová hra, která vznikla na **AT&T Junior Hackathonu**. Hráč dostává
skutečné perexy článků z českých zpravodajských webů, které jsou promíchané
s falešnými verzemi vygenerovanými AI. U každého článku swipne doprava
(pravda) nebo doleva (fake). Za správné odpovědi dostává body a mince, které může
utratit v obchodě za power-upy.

## Funkce

- **Swipe feed**: karty s články. Po swipnutí se ukáže, jestli byl článek pravý,
  a u fake verze i vysvětlení, co bylo změněno.
- **AI generátor fake perexů** (Google Gemini / Groq) s automatickým
  přepínáním na záložní model.
- **Scrapery zpráv**: ČT24, Seznam Zprávy a Hospodářské noviny, s deduplikací článků.
- **Herní ekonomika**: mince, streaky, denní nabídky a obchod s power-upy
  (nápovědy, přeskočení, záchranná síť, násobiče skóre…).
- **Žebříček**: celkový i týdenní.
- **Simulace**: vizualizace šíření dezinformací ve společnosti.
- **Admin panel**: spouštění scraperů, generování fake článků a správa obsahu.
- Přihlášení přes Firebase Auth, tmavý režim, onboarding, mobilní rozhraní.

## Tech stack

| Vrstva    | Technologie                                          |
|-----------|------------------------------------------------------|
| Frontend  | Next.js 16 (App Router), React 19, TypeScript        |
| Styl      | Tailwind CSS 4, Framer Motion, lucide-react          |
| Backend   | Next.js API routes                                   |
| Databáze  | Firebase Firestore                                   |
| Auth      | Firebase Authentication (e-mail + heslo)             |
| AI        | Google Gemini (`@google/genai`), Groq (OpenAI SDK)   |
| Scraping  | axios, cheerio, iconv-lite                           |

## Struktura projektu

```
quackr/
├── app/
│   ├── api/            # API routy (scrapery, generování fake článků, swipe…)
│   ├── admin/          # admin panel
│   ├── feed/           # hlavní swipe hra
│   ├── shop/ ranking/ profile/ settings/ simulation/ …
├── components/         # sdílené React komponenty
├── lib/                # služby: Firestore, scrapery, AI generátor, auth…
├── public/             # obrázky a logo
└── scripts/            # pomocné skripty (výpis dostupných Gemini modelů)
```

## Spuštění lokálně

**Požadavky:** Node.js 20.9+ a vlastní Firebase projekt.

```bash
git clone https://github.com/Polmi985/quackr.git
cd quackr
npm install
cp .env.example .env.local   # pak doplň vlastní hodnoty
npm run dev
```

Aplikace poběží na <http://localhost:3000>.

### Proměnné prostředí

Všechny jsou popsané v [`.env.example`](.env.example).

| Proměnná                          | Kde ji vzít                                     |
|-----------------------------------|-------------------------------------------------|
| `NEXT_PUBLIC_FIREBASE_*`          | Firebase console → Project settings → Your apps |
| `GEMINI_API_KEY`                  | <https://aistudio.google.com/apikey>            |
| `GROQ_API_KEY`                    | <https://console.groq.com/keys>                 |

> Soubor `.env.local` se nikdy necommituje (je v `.gitignore`).

### Nastavení Firebase

1. Ve Firebase console vytvoř projekt a přidej do něj **web app**.
2. Zapni **Authentication → Sign-in method → Email/Password**.
3. Vytvoř databázi **Firestore**.
4. Admina přidáš tak, že v kolekci `admin` založíš dokument, jehož ID je
   UID uživatele (najdeš ho v Authentication → Users).
5. Pro deploy na Firebase Hosting uprav ID projektu v `.firebaserc`
   a spusť `npm run deploy:hosting`.

## Bezpečnost

- Admin API routy (scrapery, mazání, generování) ověřují Firebase ID token
  a členství uživatele v kolekci `admin`.
- Routa `/api/swipe` bere identitu hráče z ověřeného tokenu a správnost
  odpovědi kontroluje podle databáze, ne podle dat od klienta.
- AI klíče (`GEMINI_API_KEY`, `GROQ_API_KEY`) se používají jen na serveru.

### Známá omezení (hackathonový projekt)

- Server přistupuje k Firestore přes klientské Firebase SDK, takže Firestore
  security rules nemohou rozlišit server od klienta. Pro produkční nasazení
  je vhodné přejít na `firebase-admin` se service accountem a zpřísnit pravidla.
- Část herní logiky (obchod, mince, inventář) běží přímo v prohlížeči proti
  Firestore a spoléhá na security rules.
- Feed posílá informaci `isFake` klientovi předem (kvůli okamžité zpětné vazbě).

## Autoři

Projekt vytvořil tým na AT&T Junior Hackathonu:

- **David Polaštík**
- Adam Kolařík
- Tomáš Zapletal
- Štěpa Buriánek
- Viktor Šimůnek

## Licence

[MIT](LICENSE)
