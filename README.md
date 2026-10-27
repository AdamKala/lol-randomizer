# LoL Randomizer Desktop

Nativně spouštěná desktopová aplikace pro Windows postavená na Electronu, Reactu, TypeScriptu a Vite. Náhodně rozdělí pětičlenné premade role a šampiony, hlídá globální cooldown a rozlišuje nepotvrzený návrh od skutečně odehrané hry.

## Rychlý start

Požadován je Node.js 22.

```bash
npm install
npm run dev
```

`npm run dev` spustí Vite a automaticky otevře samostatné okno Electronu. Nejde o stránku, kterou je potřeba ručně otevírat v prohlížeči.

Kontroly a sestavení produkčních souborů:

```bash
npm test
npm run lint
npm run build
npm start
```

`npm run build` vytvoří renderer v `dist/` a bezpečné Electron main/preload procesy v `dist-electron/`. `npm start` spustí právě tyto produkční soubory přes stabilní lokální origin `app://bundle`.

## Windows `.exe`

Na Windows spusť:

```bash
npm ci
npm run dist:win
```

Ve složce `release/` vzniknou:

- `LoL-Randomizer-Setup-1.0.0-x64.exe` — klasický NSIS instalátor;
- `LoL-Randomizer-Portable-1.0.0-x64.exe` — portable verze bez instalace.

Buildy nejsou digitálně podepsané, dokud není do CI doplněn code-signing certifikát. Windows SmartScreen proto může u prvních stažení zobrazit varování neznámého vydavatele.

## Funkce

- přesně pět unikátních hráčů a pět unikátních rolí;
- champion pool podle reálně hrané role, nikoli podle Riot tříd;
- rovnoměrný náhodný výběr bez duplicit v sestavě;
- reroll rolí i šampionů, pouze šampionů nebo jednoho šampiona;
- potvrzení „🎮 Jdeme do hry!“ jako jediný okamžik zápisu historie;
- globální cooldown odvozený z posledních 0–10 potvrzených her (výchozí 3);
- vrácení poslední hry, bezpečné smazání a automatický přepočet cooldownu;
- JSON export/import historie a validovaný import novějších meta dat;
- plně lokální výchozí dataset i 157 champion ikon.

## Offline provoz a ukládání

Výchozí role dataset `public/data/champion-roles.v1.json` a všechny ikony, které používá, jsou součástí aplikace. Po instalaci tedy randomizer, historie i obrázky fungují bez připojení k internetu. Externí odkaz na zdroj dat se pouze na vyžádání otevře ve výchozím systémovém prohlížeči.

Hráči, rozpracovaný draft, historie, nastavení i importovaný dataset se ukládají do persistentního Chromium `localStorage` v uživatelském profilu Electronu. Data přežijí zavření i aktualizaci aplikace. Neexistuje žádný backend, účet ani telemetrie.

## Bezpečnost Electronu

- `contextIsolation: true`;
- `nodeIntegration: false`;
- Chromium sandbox je zapnutý;
- renderer nemá přístup k Node.js ani obecnému IPC;
- preload zveřejňuje pouze neměnnou informaci o desktopovém prostředí;
- všechny permission requesty jsou zamítnuté;
- nové stránky a navigace mimo aplikaci jsou blokované;
- povolené HTTPS odkazy se otevírají přes systémový prohlížeč;
- Content Security Policy zakazuje vzdálené skripty, objekty a rámce;
- produkční soubory se načítají přes omezený `app://bundle` protokol s kontrolou cest.

## Architektura

```text
electron/
├── main.ts                   # životní cyklus okna, app:// protokol a security policy
└── preload.ts                # minimální izolovaný bridge
src/
├── App.tsx                   # React UI
├── lib/
│   ├── randomizer.ts         # čisté losování, cooldown a potvrzení
│   ├── meta.ts               # načtení a validace role datasetu
│   └── storage.ts            # verzované localStorage a zálohy
└── types.ts
public/
├── champions/                # lokální Data Dragon ikony
└── data/champion-roles.v1.json
```

Doménová logika zůstává oddělená od Reactu i Electronu a je pokrytá testy ve `src/lib/randomizer.test.ts`.

## Meta data

Výchozí dataset je transparentně označený snapshot pro patch 26.21. U.GG neposkytuje veřejné dokumentované API a projekt nepoužívá scraping ani interní endpointy. Riot `match-v5` vyžaduje chráněný API klíč a serverovou agregaci, proto není bezpečné provádět automatickou živou aktualizaci ve frontendové aplikaci.

Aplikace ukazuje zdroj, patch, datum a stav zastaralosti. Aktuálnější kompatibilní JSON lze importovat přímo v UI. Import kontroluje verzi schématu, stabilní Riot ID, Data Dragon slugy, role, duplicity a statistiky.

Lokální ikony lze po změně výchozího datasetu obnovit příkazem:

```bash
npm run assets:download
```

## GitHub Actions

Workflow `.github/workflows/desktop.yml`:

- po každém pushi do `main` a v pull requestu spustí testy, lint a produkční build;
- při ručním `workflow_dispatch` sestaví instalátor i portable `.exe` na `windows-latest` a zveřejní je jako Actions artifact;
- při publikaci GitHub Release vytvoří stejné `.exe`, nahraje artifact a připojí oba soubory přímo k Release.

V repozitáři otevři **Actions → Desktop CI and Windows release → Run workflow**. Po dokončení stáhneš archiv v sekci **Artifacts**.

## GitHub účet AdamKala

Projekt je určen výhradně pro `AdamKala/lol-randomizer`. Před vytvořením repozitáře ověř účet:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth status
gh api user --jq .login
```

Poslední příkaz musí vypsat přesně `AdamKala`. Pokud je přihlášeno více účtů:

```bash
gh auth switch -u AdamKala
gh api user --jq .login
```

Teprve potom:

```bash
git init -b main
git add .
git commit -m "feat: add Electron desktop app"
gh repo create AdamKala/lol-randomizer --public --source=. --remote=origin --push
```

## Riot Games disclaimer

LoL Randomizer isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

Champion metadata and images originate from Riot Games Data Dragon. Statistical role combinations are an attributed point-in-time snapshot; their availability and accuracy are not guaranteed by Riot Games.

## Licence

Zdrojový kód je pod licencí MIT. Herní názvy, obrázky a ochranné známky patří příslušným vlastníkům.
