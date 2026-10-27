# LoL Randomizer Desktop

Lehká desktopová aplikace postavená na Tauri 2, Reactu, TypeScriptu, Vite a Rustu. Uchovává stálý roster, z 1–5 zaškrtnutých hráčů náhodně rozdělí role a šampiony, hlídá globální cooldown a bez API klíče doplní z veřejných profilů OP.GG výsledky, poslední hry a dlouhodobé statistiky.

Tauri používá systémový webview. Aplikace proto nebalí Chromium ani Node.js runtime a Windows instalátor je výrazně menší než původní Electron verze.

## Rychlý start

Potřebuješ Node.js 22, Rust 1.90 nebo novější a systémové závislosti Tauri 2.

```bash
npm install
npm run dev
```

`npm run dev` spustí Vite na interním portu 1420 a otevře samostatné okno Tauri. Samotný frontend pro prohlížeč lze spustit příkazem `npm run dev:web`; některé desktopové funkce v něm záměrně nejsou dostupné.

Spouštěcí skript automaticky najde Cargo nainstalované přes rustup v `~/.cargo/bin`, i když byl terminál otevřený ještě před instalací Rustu. Na Linuxu zároveň odstraní konfliktní GTK/GIO proměnné zděděné ze Snap verze VS Code.

Na Ubuntu/Debianu je před prvním spuštěním potřeba doplnit závislosti Tauri:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Kontroly a produkční sestavení:

```bash
npm test
npm run lint
npm run build:web
npm run build
```

`npm run build:web` ověří TypeScript a vytvoří pouze optimalizovaný frontend v `dist/`. `npm run build` sestaví nativní Tauri aplikaci a balíčky pro aktuální operační systém.

## Windows `.exe`

Na Windows x64:

```bash
npm ci
npm run dist:win
```

Příkaz vytvoří NSIS instalátor a zkopíruje jej do `release/`. Do stejné složky uloží také samostatnou přenosnou binárku:

- `LoL-Randomizer-2.0.1-x64-setup.exe` — instalátor se zástupci a odinstalací;
- `LoL-Randomizer-Portable-2.0.1-x64.exe` — přímé spuštění bez instalace.

Instalátor používá režim WebView2 `downloadBootstrapper`: nepřibaluje celý runtime a v případě potřeby jej při instalaci stáhne. Portable varianta potřebuje WebView2 již přítomné v systému; na běžných aktuálních Windows 10/11 je součástí systému.

Buildy nejsou digitálně podepsané. Windows SmartScreen proto může při prvním spuštění zobrazit varování neznámého vydavatele.

## Funkce

- trvale uložený roster libovolného počtu hráčů s checkboxy pro dnešní sestavu;
- čistě náhodné losování pro 1–5 zaškrtnutých hráčů a stejný počet unikátních rolí;
- champion pool podle skutečně hraných pozic v U.GG/OP.GG metě, včetně netradičních picků jako Karthus ADC;
- reroll rolí i šampionů, pouze šampionů nebo jediného šampiona;
- individuální změna linky a výměna jen dotčených rolí;
- potvrzení „🎮 Jdeme do hry!“ jako jediný okamžik zápisu randomizer hry do historie;
- globální cooldown šampionů z posledních potvrzených her, výchozí délka 3;
- automatické dohledání výsledku a stránkovaný import her z veřejných dat OP.GG;
- záložky Obecné, Statistiky a Poslední hry, detail hráče, řazení, týmové pozice a společné winraty;
- damage, K/D/A, KDA, CS, goldy, vision, OP.GG výkon, pořadí a grafy;
- tmavý i světlý režim, EUNE/EUW, JSON export/import historie a meta datasetu;
- plně lokální výchozí meta dataset a 157 ikon šampionů.

Statistiky ani oblíbené pozice hráčů nikdy neovlivňují losování. Importované OP.GG hry vstupují do statistik, ale neovlivňují cooldown randomizeru.

## Offline provoz a ukládání

Historie, cooldown, výběr hráčů, nastavení a importovaný dataset zůstávají v persistentním úložišti webview (`localStorage`). Výchozí role dataset a ikony jsou zabalené v aplikaci, takže randomizer funguje offline.

Roster a deduplikovaná cache výsledků se ukládají také do JSON souborů:

- při `npm run dev` přímo do verzovaných `data/players.json` a `data/statistics.json`;
- v instalované nebo portable aplikaci do uživatelské datové složky Tauri.

Při prvním spuštění release aplikace se použije výchozí cache zakompilovaná v binárce. Po běžném commitu a pushi mohou vývojáři sdílet aktualizovaný roster i už načtené detailní statistiky:

```bash
git add data/players.json data/statistics.json
git commit -m "data: update roster and statistics"
git push
```

Push aplikace sama nikdy neprovádí. Soubory obsahují jména a Riot ID v čitelné podobě, takže v public repozitáři budou veřejné.

### Přenos dat z Electron verze

Migrace z Electronu existující data nemaže ani nepřepisuje. Starou aplikaci ponech nainstalovanou, v její historii použij JSON export a stejný soubor importuj v Tauri verzi. Tím se přenesou potvrzené hry i podklady cooldownu bez závislosti na odlišném umístění Chromium/WebView úložiště.

## OP.GG bez API klíče

Síťové požadavky provádí oficiální Tauri HTTP plugin v Rust backendu, takže nejsou omezené CORS webview. Capability dovoluje přístup pouze k HTTPS hostům OP.GG. Aplikace nestahuje vzdálené skripty do svého UI a nepoužívá soukromý ani autentizovaný endpoint.

OP.GG je externí služba a struktura jeho veřejných stránek se může změnit. Parser má testy a při nekompatibilní změně zobrazí chybu místo poškození lokální historie. Již kompletní zápasy z `statistics.json` se při dalším importu nestahují znovu.

## Bezpečnost a architektura

- frontend nemá Node.js ani obecný přístup k souborovému systému;
- Rust vystavuje pouze čtyři příkazy pro načtení a validované uložení rosteru/statistik;
- zápis používá dočasný soubor a serializovaný přístup;
- OP.GG a externí odkazy mají omezené Tauri capabilities;
- Content Security Policy blokuje vzdálené skripty, objekty, rámce a nepovolené připojení;
- release build používá LTO, `opt-level = "z"`, jedinou codegen jednotku, odstranění symbolů a `panic = "abort"`.

```text
src-tauri/
├── src/lib.rs                # Tauri lifecycle a bezpečné JSON úložiště
├── capabilities/default.json # přesná síťová a opener oprávnění
├── tauri.conf.json           # okno, CSP, NSIS a WebView2
└── Cargo.toml                # minimální Rust závislosti a size profil
src/
├── App.tsx                   # stávající React UI
├── tauri-bridge.ts           # úzký kompatibilní desktop bridge
└── lib/
    ├── opgg.ts               # veřejná OP.GG historie přes Tauri HTTP
    ├── randomizer.ts         # losování, cooldown a potvrzení
    ├── statistics-file.ts    # validace a deduplikace sdílené cache
    ├── playerDetail.ts       # detail hráče
    └── storage.ts            # localStorage a JSON zálohy
```

## GitHub Actions

Workflow `.github/workflows/desktop.yml`:

- po pushi do `main` a v pull requestu spustí všech 53 testů, lint a produkční frontend build;
- po pushi do `main`, ručním `workflow_dispatch` a při vydání sestaví na `windows-latest` skutečný Windows x64 Tauri build;
- vytvoří NSIS instalátor i portable `.exe` a nahraje je jako Actions artifact;
- změří NSIS instalátor v bajtech i MB a vypíše warning nad limitem 24 900 000 bajtů;
- při publikaci GitHub Release připojí obě `.exe` přímo k vydání.

V repozitáři otevři **Actions → Tauri desktop CI → Run workflow**. Po dokončení stáhneš archiv `lol-randomizer-windows-*` v sekci Artifacts.

## GitHub účet

Projekt patří výhradně do `AdamKala/lol-randomizer` a používá SSH remote:

```bash
git remote -v
ssh -T git@github.com
git push origin main
```

GitHub CLI musí před operacemi vracet účet `AdamKala`; účet `DevUnknownAgency` se pro tento projekt nesmí použít.

## Riot Games disclaimer

LoL Randomizer isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## Licence

Zdrojový kód je pod licencí MIT. Herní názvy, obrázky a ochranné známky patří příslušným vlastníkům.
