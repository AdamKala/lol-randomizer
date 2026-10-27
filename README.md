# LoL Randomizer Desktop

Nativně spouštěná desktopová aplikace postavená na Electronu, Reactu, TypeScriptu a Vite. Uchovává stálý roster, z 1–5 zaškrtnutých hráčů náhodně rozdělí role a šampiony, hlídá globální cooldown a bez API klíče doplní z veřejných profilů OP.GG výsledky, posledních deset zápasů a dlouhodobé statistiky.

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

Vývojový režim používá vlastní řízený restart Electron procesu. Změny v main/preload kódu tak na Linuxu neukončí `esbuild` proces Vite a renderer může dál používat HMR.

## Windows `.exe`

Na Windows spusť:

```bash
npm ci
npm run dist:win
```

Ve složce `release/` vzniknou:

- `LoL-Randomizer-Setup-1.4.1-x64.exe` — klasický NSIS instalátor;
- `LoL-Randomizer-Portable-1.4.1-x64.exe` — portable verze bez instalace.

Buildy nejsou digitálně podepsané, dokud není do CI doplněn code-signing certifikát. Windows SmartScreen proto může u prvních stažení zobrazit varování neznámého vydavatele.

## Funkce

- trvale uložený roster libovolného počtu hráčů s checkboxy pro dnešní sestavu;
- losování pro 1–5 zaškrtnutých hráčů a stejný počet unikátních rolí;
- champion pool podle reálně hrané role, nikoli podle Riot tříd;
- rovnoměrný náhodný výběr bez duplicit v sestavě;
- reroll rolí i šampionů, pouze šampionů nebo jednoho šampiona;
- individuální změna linky na kartě hráče; obsazená linka se prohodí pouze mezi dotčenými dvěma hráči;
- potvrzení „🎮 Jdeme do hry!“ jako okamžik zápisu plánu do historie;
- automatické dohledání společného dokončeného zápasu z veřejných profilů OP.GG bez API klíče;
- jednorázový import posledních 10 zápasů každého hráče s Riot ID, včetně deduplikace společných her;
- horní záložky **Obecné**, **Statistiky** a **Poslední hry**;
- poslední hry seskupené po zápasech do rozbalovacích karet se skutečným výsledkem, K/D/A, KDA, damage, OP.GG hodnocením a damage grafem;
- samostatná sekce dlouhodobých statistik s winratem, průměrným KDA, výkonem, CS, damage a vision;
- tmavý a světlý vzhled a volba regionu EUNE/EUW ve viditelném menu Nastavení;
- globální cooldown odvozený z posledních 0–10 potvrzených her (výchozí 3);
- vrácení poslední hry, bezpečné smazání a automatický přepočet cooldownu;
- JSON export/import historie a validovaný import novějších meta dat;
- plně lokální výchozí dataset i 157 champion ikon.

## Offline provoz a ukládání

Výchozí role dataset `public/data/champion-roles.v1.json` a všechny ikony, které používá, jsou součástí aplikace. Po instalaci tedy randomizer, historie i obrázky fungují bez připojení k internetu. Externí odkaz na zdroj dat se pouze na vyžádání otevře ve výchozím systémovém prohlížeči.

Roster se při spuštění ze zdrojového projektu ukládá do verzovaného souboru `data/players.json`. Přidání hráče, změna jména či Riot ID i odebrání hráče soubor automaticky upraví. Po běžném `git add`, commitu a pushi je tedy stejný roster součástí repozitáře a načte se i na dalším počítači.

```bash
git add data/players.json
git commit -m "data: update player roster"
git push
```

Push není prováděn automaticky aplikací. Výběr hráčů, rozpracovaný draft, historie, stažené výsledky, nastavení a importovaný dataset zůstávají v persistentním Chromium `localStorage`; nepatří do Gitu. Instalovaná či portable aplikace nemá pracovní Git repozitář, a proto používá vlastní `players.json` v uživatelském profilu. Git synchronizace rosteru funguje při spuštění přes `npm run dev` nebo `npm start` přímo v checkoutu projektu.

Pozor: `data/players.json` obsahuje jména a případná Riot ID v čitelné podobě. V public repozitáři budou po pushi veřejná.

Randomizer, cooldown, historie a už stažené statistiky fungují offline. Nový výsledek lze načíst jen s připojením k internetu a dostupným veřejným profilem OP.GG.

## Automatické výsledky a statistiky

1. U každého hráče vyplň Riot ID ve formátu `Jméno#TAG`.
2. Ve viditelném menu **Nastavení** vyber region EUNE nebo EUW.
3. Vygeneruj sestavu a před hrou potvrď **🎮 Jdeme do hry!**
4. Po dohrání aplikace společný zápas automaticky dohledá na OP.GG. Čekající hry kontroluje každé tři minuty a také po příštím spuštění; výsledek lze načíst i ručně v historii.
5. Tlačítko **Načíst posledních 10 / hráč** v sekci **Poslední hry** načte posledních deset zápasů všech uložených hráčů s Riot ID. Společné zápasy uloží jen jednou a hráče bez Riot ID přeskočí.

Importované zápasy mají vlastní záložku **Poslední hry**, vstupují do statistik, ale neovlivňují historii sestav ani cooldown randomizeru. Jeden společný zápas se zobrazí jako jedna rozbalovací karta s počtem vašich hráčů; uvnitř je jejich damage graf a jednotlivé výkony. Aplikace načte profilový souhrn a poté veřejný detail každého unikátního zápasu, ze kterého doplní přesný damage, vision a OP.GG skóre i pořadí hráče. Mezery kolem `#` v Riot ID nevadí. Pokud detail dočasně není dostupný, zachová K/D/A a CS z profilu, zobrazí upozornění a dovolí detail později aktualizovat.

Automatické párování přijme společnou hru, která začala nejvýše 12 hodin po potvrzení sestavy. OP.GG je externí web a jeho HTML se může v budoucnu změnit; aplikace proto používá jeho veřejný strukturovaný JSON-LD výstup a při nekompatibilní změně zobrazí konkrétní chybu namísto poškození historie.

## Bezpečnost Electronu

- `contextIsolation: true`;
- `nodeIntegration: false`;
- Chromium sandbox je zapnutý;
- renderer nemá přístup k Node.js ani obecnému IPC;
- preload zveřejňuje jen úzce vymezené operace pro načtení posledních a společných zápasů;
- renderer nemůže určit libovolnou cílovou URL; Electron main proces komunikuje pouze s veřejnými profily `https://op.gg/lol/summoners/...`;
- všechny permission requesty jsou zamítnuté;
- nové stránky a navigace mimo aplikaci jsou blokované;
- povolené HTTPS odkazy se otevírají přes systémový prohlížeč;
- Content Security Policy zakazuje vzdálené skripty, objekty a rámce;
- produkční soubory se načítají přes omezený `app://bundle` protokol s kontrolou cest.

## Architektura

```text
electron/
├── main.ts                   # životní cyklus okna, app:// protokol a security policy
├── matches.ts                # bezklíčové čtení profilů a detailů veřejných OP.GG zápasů
└── preload.ts                # minimální izolovaný bridge
src/
├── App.tsx                   # React UI
├── lib/
│   ├── randomizer.ts         # čisté losování, cooldown a potvrzení
│   ├── meta.ts               # načtení a validace role datasetu
│   ├── stats.ts              # agregace skutečných Riot výsledků
│   ├── recentMatches.ts      # deduplikace a převod posledních zápasů do historie
│   └── storage.ts            # migrace, verzované localStorage a zálohy
└── types.ts
public/
├── champions/                # lokální Data Dragon ikony
└── data/champion-roles.v1.json
```

Doménová logika zůstává oddělená od Reactu i Electronu a je pokrytá testy ve `src/lib/randomizer.test.ts`.

## Meta data

Výchozí dataset je transparentně označený snapshot pro patch 26.21. Meta snapshot zůstává oddělený od výsledků her. Výsledky aplikace bez přihlašování čte z veřejného strukturovaného obsahu profilových stránek a detailů zápasů OP.GG v izolovaném Electron main procesu; nepoužívá soukromý ani autentizovaný endpoint.

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
gh auth login --hostname github.com --git-protocol ssh --web
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
