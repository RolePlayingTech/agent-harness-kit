# Przewodnik użytkownika (PL)

Agent Harness Kit instaluje instrukcje pracy dla agentów programistycznych i sprawdza ich konfigurację. Wymaga Node.js 20 lub nowszego. Ta gałąź stabilizacyjna czeka na review; przed użyciem sprawdź [kontrakt CLI](../README.md#cli-contract) i [znane ograniczenia](STABILIZATION.md).

## Zacznij od podglądu

Uruchom z katalogu repozytorium w wybranej wersji:

```sh
node bin/agent-harness.mjs inspect . --json
node bin/agent-harness.mjs plan . --archetype saas-web
node bin/agent-harness.mjs init ../my-project --provider codex --profile smart-tiered --policy balanced --dry-run --json
node bin/agent-harness.mjs init ../my-project --provider codex --profile smart-tiered --policy balanced
node bin/agent-harness.mjs verify ../my-project --strict
```

`inspect` i `plan` nie zapisują plików. Skaner odczytuje wybrane informacje o repozytorium; wynik nie jest pełnym audytem architektury. `plan` wyświetla gotowy katalog opcji technologicznych. Nie prowadzi rozmowy, nie korzysta z modelu i nie zapisuje decyzji projektowej.

`--provider` i `--adapters` są aliasami **jednego** wyboru: `codex`, `claude`, `cursor`, `antigravity` albo `universal`. Listy rozdzielone przecinkami są odrzucane; wybierz jawnie `universal`, jeśli potrzebujesz jego zestawu plików. Opcja określa generowane pliki, a nie potwierdzoną integrację z mechanizmem odkrywania skilli każdej platformy. Dokładne ścieżki zawiera [tabela dostawców](../README.md#provider-output-and-discovery).

`--testing` / `--profile` przyjmuje `fast-prototype`, `smart-tiered`, `isolated-verifier` lub `mission-critical`. Profile proponują sposób pracy; nie uruchamiają testów ani nie gwarantują poziomu błędów. `--context` / `--policy` przyjmuje `minimal`, `balanced`, `deep-research` lub `low-cost`. Starsze nazwy `strict` i `expansive` pozostają aliasami. Limity są konfigurowalną preferencją projektu, a nie zmierzonym progiem możliwości modelu.

Nieznane flagi, brakujące wartości, nieprawidłowe wartości i sprzeczne aliasy powodują błąd. Nie ma opcji `--mode`, `--security` ani `--name`. `copilot` i `windsurf` nie są obsługiwanymi wyborami dostawcy. `--force` dotyczy `init` i `update`; odinstalowanie nie ma trybu force.

## Nowy projekt: rozmowa przed dokumentacją

Napisz do agenta: „Użyj skilla harness-architect. Pomóż określić problem, użytkowników, MVP, non-goals i ograniczenia. Oddziel moje decyzje od swoich propozycji”.

Skill prowadzi rozmowę, jeżeli agent potrafi go odnaleźć i zastosować. CLI nie zapisuje jeszcze odpowiedzi we wspólnym ProjectSpec. Zapisuj otwarte pytania i akceptację wprost; wygenerowany dokument nie oznacza zatwierdzenia decyzji.

Opcjonalne `init --blueprint` tworzy szkielety do edycji:

- `docs/PROJECT_BRIEF.md` i `docs/ARCHITECTURE.md`;
- `docs/adr/0001-harness-and-testing-tradeoffs.md` i `docs/ROADMAP.md`;
- `feature_list.json`, `docs/schemas/feature-list.schema.json` i `HANDOFF.md`.

Te pliki zawierają miejsca do uzupełnienia oraz ogólne kroki. Sprawdź każde stwierdzenie i polecenie. Wygenerowany ADR nie dowodzi zatwierdzenia architektury przez użytkownika. Zaplanowana komenda nie dowodzi istnienia testów aplikacji. Właściwy proces zatwierdzonych decyzji jest przedmiotem [#28](https://github.com/RolePlayingTech/agent-harness-kit/issues/28).

## Istniejący projekt: najpierw odczyt

Przejrzyj `inspect --json` i sprawdź ważne obserwacje w plikach źródłowych. Znaleziony skrypt dowodzi tylko obecności jego definicji. Obecny skaner nie ustala pełnych zależności komponentów, kontraktów API, granic autoryzacji ani bezpieczeństwa migracji. Poproś agenta o rozróżnienie faktów, hipotez i niewiadomych przed zmianą kodu.

Obejrzyj plan instalacji przed zapisem. Istniejące główne instrukcje i dokumenty blueprintu należą do użytkownika: aktualizacja zachowuje je bez jawnego `--force`, a odinstalowanie zachowuje je zawsze. Istniejący plik nie staje się zarządzany tylko dlatego, że ma identyczną treść.

```sh
node bin/agent-harness.mjs update ../my-project --provider codex --dry-run --json
node bin/agent-harness.mjs update ../my-project --provider codex
node bin/agent-harness.mjs uninstall ../my-project --dry-run --json
```

Plan JSON zawiera ścieżki i hashe treści; nie jest porównaniem tekstu wiersz po wierszu. Suma kontrolna w manifeście sama nie uprawnia do nadpisania ani usunięcia pliku. Usuwane mogą być tylko statyczne pliki z dozwolonej listy, zgodne jednocześnie z bieżącą paczką i sumą w manifeście. Zmieniona lub nieznana historyczna treść pozostaje. Cały plan jest sprawdzany przed zapisem; synchroniczny błąd operacji uruchamia rollback, a błąd odzyskiwania jest raportowany. Nie ma trwałego dziennika odzyskiwania po awarii procesu ani ochrony przed równoległą wrogą zmianą systemu plików. Szczegóły opisuje [kontrakt odzyskiwania](STABILIZATION.md).

## Co potwierdza weryfikacja

`verify` sprawdza konfigurację: główne pliki, obsługiwane reguły frontmatter, odwołania i ograniczenia rejestru zadań. **Nie uruchamia testów aplikacji, buildów ani typechecków** i nie uwierzytelnia ręcznie wpisanego dowodu wykonania. Kopiowany samodzielny weryfikator wciąż różni się od CLI; nie traktuj ich jako równoważnych bramek jakości aplikacji.

`audit` pokazuje statyczne ustalenia oraz szacunki rozmiaru instrukcji na podstawie liczby znaków. Hipotetyczne oszczędności nie są pomiarem zużycia tokenów. `doctor` ma charakter informacyjny. `autotrigger` dopisuje brakujące odwołania do skilli w `AGENTS.md`; sprawdź jego diff.

Uruchamiaj właściwe testy aplikacji osobno i zapisuj komendy, kody wyjścia oraz sprawdzoną rewizję. Poprawny harness nie dowodzi ukończenia aplikacji. Wykonawca kontroli z limitami oraz dowodami wykonania jest przedmiotem [#26](https://github.com/RolePlayingTech/agent-harness-kit/issues/26).

Skille Markdown kierują zachowaniem modelu. Nie wymuszają uprawnień sandboxu, akceptacji wdrożenia ani ochrony gałęzi. Te zabezpieczenia skonfiguruj w platformie i CI. Nie deklarujemy zmierzonych oszczędności tokenów ani przewagi jakościowej; benchmarki pozostają zakresem [#34](https://github.com/RolePlayingTech/agent-harness-kit/issues/34).
