# Podręcznik Użytkownika (PL) — AI Agent Harness Kit v2.0

Ten przewodnik przeprowadzi Cię **za rączkę** przez cały proces pracy z uprzężą agentową (*AI Agent Harness*) — niezależnie od tego, czy startujesz **w pustym folderze od samego pomysłu na aplikację (Ścieżka A: Greenfield)**, czy podłączasz agenta do **istniejącego, rozbudowanego projektu (Ścieżka B: Brownfield)**.

---

## 1. Dlaczego potrzebujesz uprzęży (Harnessu), a nie tylko jednego pliku?

Gdy dajesz agentowi AI (Claude Code, Cursor, GitHub Copilot, Codex, Windsurf, Antigravity) dostęp do repozytorium bez uprzęży:
1. **W nowym projekcie (Greenfield):** Agent zaczyna pisać kod na oślep, miesza biblioteki, nie ustala granic MVP i po 20 wiadomościach gubi wątek architektury.
2. **W istniejącym projekcie (Brownfield):** Agent zadaje Ci dziesiątki pytań o rzeczy, które sam mógłby przeczytać z `package.json`, `pyproject.toml` albo `tsconfig.json`, lub — co gorsza — nadpisuje Twoje istniejące konwencje.
3. **Pułapka Testy kontra Tokeny:** Jeśli każesz agentowi „pisać testy do wszystkiego i uruchamiać je po każdej zmianie”, logi z Playwrighta lub Vitesta potrafią spalić **15 000 – 45 000 tokenów w kilka tur**, wpędzając model w tzw. *Context Rot* (gnicie kontekstu). Z kolei brak testów oznacza ciche psucie aplikacji.

**`agent-harness-kit` v2.0** rozwiązuje te trzy problemy poprzez **Dual-Mode Wizard** (tryb podwójny) oraz **Matrycę Kompromisów Testy kontra Kontekst**.

---

## 2. Szybki Start (CLI lub rozmowa z Agentem)

### Opcja A: Uruchomienie przez CLI (w terminalu)
W dowolnym katalogu (pustym lub z kodem) uruchom:

```bash
# 1. Zobacz, co detektor wykrywa w Twoim folderze (zero zmian na dysku)
npx github:RolePlayingTech/agent-harness-kit inspect .

# 2. Wyświetl rekomendowany plan (Ścieżka A lub Ścieżka B + profil testów)
npx github:RolePlayingTech/agent-harness-kit plan .

# 3. Zainstaluj skille i wygeneruj uprząż (bezpiecznie, bez nadpisywania Twoich plików)
npx github:RolePlayingTech/agent-harness-kit init . --profile smart-tiered --blueprint
```

### Opcja B: Rozmowa „za rączkę” z Twoim agentem AI
Po zainstalowaniu skilli (lub skopiowaniu katalogu `skills/` do `.agents/skills/`), napisz do swojego agenta na czacie:

> **„Użyj skilla `harness-architect`. Sprawdź moje repozytorium i poprowadź mnie za rączkę przez konfigurację projektu, dobór testów i budżetu kontekstu.”**

Agent automatycznie wykryje, czy jesteś na **Ścieżce A (Greenfield)**, czy **Ścieżce B (Brownfield)** i uruchomi właściwy protokół rozmowy.

---

## 3. Ścieżka A: Nowy Projekt od Zera (Greenfield — `greenfield-advisor`)

Gdy uruchamiasz agenta w **pustym repozytorium** (lub masz tylko `README.md`), agent **NIE pyta od razu o komendy lintera**, bo żaden kod jeszcze nie istnieje! Zamiast tego prowadzi Cię przez 4 kroki architektoniczne:

### Krok 1: Wizja Produktu i Twarde Granice MVP
Agent dopytuje (maksymalnie 3 krótkie pytania na turę):
- **Co budujemy i dla kogo?** (np. SaaS B2B do fakturowania, aplikacja mobilna, narzędzie CLI, sklep).
- **Jaka jest główna pętla wartości (Core Loop) w MVP?**
- **Czego świadomie NIE budujemy w wersji v1 (Non-Goals)?** — zapisanie tego w `docs/PROJECT_BRIEF.md` chroni agenta przed dokładaniem zbędnych funkcji w kolejnych sesjach.

### Krok 2: Porównanie 2–3 Stosów Technologicznych (Stack Trade-off Matrix)
Zamiast narzucać jeden framework, agent prezentuje **2 lub 3 opcje dopasowane do Twoich umiejętności i budżetu**:

| Opcja | Stos technologiczny | Kiedy warto wybrać? | Koszt / Hosting | Czytelność dla AI (AI-Legibility) |
| :--- | :--- | :--- | :--- | :--- |
| **1. Full-Stack TypeScript** | Next.js / Astro + TypeScript + Tailwind + Drizzle + Postgres | Szybkie MVP webowe/SaaS, jeden język na froncie i backendzie | \$0–\$20/mies. | **Bardzo wysoka** — ścisłe typy TS natychmiast łapią halucynacje agenta |
| **2. Python AI & API + Web** | FastAPI (Python 3.12 + Pydantic) + React/Vite + Postgres | Systemy AI/ML, przetwarzanie danych, kolejki zadań | \$5–\$30/mies. | **Wysoka** — schematy Pydantic + kontrakty OpenAPI |
| **3. Lekki Monolit Lokalny** | Node.js / Go / Astro + SQLite | Narzędzia developerskie, aplikacje lokalne, dokumentacja | \$0/mies. | **Maksymalna** — zero zewnętrznych serwisów, błyskawiczne testy |

### Krok 3: Wybór Profilu Testów kontra Zużycie Kontekstu
Agent pyta Cię wprost: **„Jak bardzo zależy Ci na testach w porównaniu do oszczędzania tokenów i szybkości pracy?”** (szczegóły w Rozdziale 5).

### Krok 4: Wygenerowanie Trwałego Blueprintu Projektu (`--blueprint`)
Po Twojej akceptacji agent tworzy fundamenty projektu:
- `AGENTS.md` (oraz opcjonalnie `CLAUDE.md`) — zwięzła mapa projektu (<80 linii).
- `docs/PROJECT_BRIEF.md` — cel produktu, grupy docelowe i Non-Goals.
- `docs/ARCHITECTURE.md` — struktura katalogów, przepływ danych i granice modułów.
- `docs/adr/0001-stack-and-testing-profile.md` — zapis decyzji architektonicznej (ADR).
- `docs/ROADMAP.md` — podział prac na kamienie milowe.
- `feature_list.json` — rejestr zadań ze statusem `"pending"` (zgodny z zasadą **Default-FAIL** — żadne zadanie nie jest odhaczone na starcie!).
- `HANDOFF.md` — dziennik przekazania zmiany między sesjami.

---

## 4. Ścieżka B: Istniejący Projekt (Brownfield — `brownfield-onboarder`)

Gdy uruchamiasz agenta w **działającym projekcie**, nic tak nie irytuje jak pytanie: *„Jakiego języka i frameworka używasz?”*. Dlatego w Ścieżce B obowiązuje żelazna zasada **Najpierw Cichy Skan, Potem Pytania o Niewiadome**.

### Krok 1: Cichy Skan Repozytorium (`inspectWorkspace`)
Agent (lub komenda `agent-harness inspect .`) po cichu bada:
- Menedżery pakietów i lockfile (`package-lock.json`, `pnpm-lock.yaml`, `pyproject.toml`, `Cargo.toml`, `go.mod`).
- Istniejące skrypty (`build`, `test`, `lint`, `typecheck`), frameworki i potoki CI (`.github/workflows/`).
- Strukturę katalogów (monolityczna vs. monorepo `apps/*`, `packages/*`).
- Istniejące pliki instrukcji (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules`) — aby **nigdy ich nie nadpisać bez Twojej zgody**.

### Krok 2: Raport z Odkryć (Grounded Findings Report)
Agent rozpoczyna rozmowę od konkretów:
> *„Przeskanowałem Twoje repozytorium. Widzę aplikację TypeScript + Astro 5 (`package.json`), testy E2E w Playwright (`playwright.config.ts`) oraz skrypt walidacji buildu (`scripts/verify-build.mjs`). Zauważyłem brak limitu budżetu kontekstu i brak izolacji długich logów E2E.”*

### Krok 3: Dyskusja o Kompromisach i Wąskich Gardłach
Dopiero po przedstawieniu faktów agent zadaje pytania o to, czego **nie widać w kodzie**:
1. Które foldery są „zamrożone” (legacy, migracje, zewnętrzne SDK) i agent nie powinien ich dotykać?
2. Które testy są wolne lub niestabilne (flaky) i nie powinny być uruchamiane po każdej drobnej edycji?
3. Jaki **Profil Testy kontra Kontekst** wybieramy na co dzień?

---

## 5. Kompromis: Dużo Testów czy Oszczędność Tokenów? (`testing-tradeoffs`)

To najważniejsza decyzja podczas konfiguracji uprzęży. Każdy uruchomiony test w głównej sesji czatu dopisuje swoje logi (`stdout`/`stderr`) do okna kontekstowego modelu:
- **Dużo testów po każdej zmianie** = wysokie bezpieczeństwo kodu, ale **błyskawiczne spalanie tokenów**, wyższe rachunki i szybsze „otępienie” agenta przez przepełnione okno kontekstowe.
- **Za mało testów** = niskie zużycie tokenów, ale agent przemyca błędy, psuje typy i ogłasza sukces mimo niedziałającego buildu.

Dlatego `agent-harness-kit` daje Ci **4 gotowe profile**, między którymi możesz przełączać się jednym poleceniem:

| Profil (`--profile`) | Kiedy uruchamiane są testy? | Koszt tokenów / turę | Ryzyko błędów | Dla kogo najlepszy? |
| :--- | :--- | :--- | :--- | :--- |
| **`fast-prototype`** | Tylko szybki `typecheck` / `lint` podczas pisania; pełny build tylko na żądanie | **~300–600 tokenów** (Najniższy) | Średnie / Wysokie | Hackathon, szybki PoC, eksploracja UI w pierwszy weekend |
| **`smart-tiered`** *(Domyślny)* | Po edycji: tylko `typecheck` + 1 test dotkniętego pliku; pełne E2E dopiero przed zamknięciem zadania | **~800–1 500 tokenów** (Optymalny) | Niskie | **90% codziennej pracy produkcyjnej (Złoty Środek)** |
| **`isolated-verifier`** | Ciężkie suity testowe i E2E odpala **osobny subagent w tle**, zwracając do głównego czatu tylko `<200 słów` podsumowania | **~500 tokenów w głównym czacie** (+ subagent) | Bardzo niskie | Duże aplikacje z głośnymi logami Playwright / Cypress / Docker |
| **`mission-critical`** | Pełny `typecheck` + `lint` + `unit` + `E2E` + audyt bezpieczeństwa przed każdym commitem | **~3 000–8 000 tokenów** (Wysoki) | Minimalne | Płatności, auth, migracje baz danych, systemy medyczne/finansowe |

### Bezpiecznik 3 Prób Naprawy (3-Strike Repair Circuit Breaker)
Niezależnie od wybranego profilu, skill `verification-loop` wymusza **Bezpiecznik 3 Prób**:
Jeśli ten sam test nie przechodzi **3 razy z rzędu**, agent ma **twardy zakaz** dalszego zgadywania w pętli (co potrafi spalić 50 000 tokenów w 5 minut). Musi się zatrzymać, zapisać hipotezę w `HANDOFF.md` i poprosić Cię o decyzję.

---

## 6. Siedem Kryzysowych Scenariuszy Kontekstowych (`context-hygiene`)

Co zrobić, gdy podczas pracy z agentem coś idzie nie tak? Skill `context-hygiene` zawiera **7 gotowych procedur ratunkowych**:

1. **Zatrucie Kontekstu (Context Poisoning):** Agent uwierzył w błędną hipotezę na początku rozmowy i brnie w ślepą uliczkę.
   - *Rozwiązanie:* Nie dyskutuj z nim przez kolejnych 10 wiadomości! Zapisz stan w `HANDOFF.md` (tylko potwierdzone fakty) i otwórz nową sesję czatu.
2. **Powódź Logów Testowych (Log Flood):** Pojedynczy błąd Playwrighta lub Webpacka wyrzucił 2 500 linii stack trace'u do okna czatu.
   - *Rozwiązanie:* Uruchamiaj testy z flagą cichą lub przekieruj wyjście do pliku tymczasowego i odczytaj tylko ostatnie 30 linii błędu.
3. **Przepełnienie przy Wielkim Refaktorze (>15 plików):** Czytanie 20 plików naraz przekracza pułap 60% RAM-u kontekstowego.
   - *Rozwiązanie:* Podziel refaktor na paczki po 3–5 plików w `feature_list.json` i deleguj zwiad do subagenta `research`.
4. **Dryf Architektury w Długim Wątku:** Po 40 wiadomościach agent zapomina o zasadach z początku sesji.
   - *Rozwiązanie:* Zastosuj **Regułę 60% Pułapu** — zamknij wątek, uruchom `agent-harness verify .` i wystartuj świeżą sesję z pliku `HANDOFF.md`.
5. **Ślepa Pętla Naprawcza (Infinite Fix Loop):** Agent naprawia plik A, psując plik B, a potem naprawia B, psując A.
   - *Rozwiązanie:* Bezpiecznik 3 Prób (`3-Strike Circuit Breaker`) — `git diff`, cofnięcie nieudanej hipotezy i zmiana podejścia architektonicznego.
6. **Przeciążenie Monorepo:** Agent ładuje instrukcje z backendu Pythonowego, gdy edytujesz tylko przycisk w Reactcie.
   - *Rozwiązanie:* Trzymaj główny `AGENTS.md` poniżej 80 linii i używaj lokalnych plików `AGENTS.md` wewnątrz poszczególnych pakietów (`apps/web/AGENTS.md`).
7. **Zepsuta Sesja Międzydniowa (Multi-Day Handoff Drift):** Wracasz do projektu po weekendzie, a nowy agent nie wie, co zostało zweryfikowane, a co tylko zaczęte.
   - *Rozwiązanie:* Kombinacja `HANDOFF.md` + `feature_list.json` ze statusem `pending` / `verified` daje nowemu agentowi pełny obraz sytuacji w mniej niż **800 tokenów**.

---

## 7. Referencja Komend CLI (`agent-harness`)

| Komenda | Opis działania |
| :--- | :--- |
| `agent-harness inspect [dir]` | Cichy skan repozytorium (Greenfield vs Brownfield, języki, testy, CI, ryzyka) — zero zmian na dysku |
| `agent-harness plan [dir]` | Prezentuje rekomendowaną ścieżkę (A lub B), profil testów i listę pytań do użytkownika |
| `agent-harness init [dir]` | Instaluje 6 skilli i generuje pliki uprzęży (bezpiecznie pomija zmodyfikowane pliki użytkownika) |
| `agent-harness verify [dir] --strict` | Twarda weryfikacja (kod wyjścia `1` przy przekroczeniu 80 linii `AGENTS.md`, błędach YAML lub niedziałających ścieżkach) |
| `agent-harness audit [dir]` | Raport zużycia tokenów, brakujących skryptów i dryfu architektury (tryb doradczy) |
| `agent-harness doctor [dir]` | Kompleksowa diagnostyka zdrowia uprzęży wraz z podpowiedziami naprawczymi |
| `agent-harness update [dir]` | Aktualizuje wyłącznie niemodyfikowane pliki skilli na podstawie sum kontrolnych SHA-256 w `.agents/harness-manifest.json` |
| `agent-harness uninstall [dir]` | Bezpiecznie usuwa zarządzane pliki uprzęży, zostawiając w spokoju wszystko, co edytowałeś ręcznie |
