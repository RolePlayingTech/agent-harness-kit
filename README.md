# AI Agent Harness Kit (`agent-harness-kit`)
### Universal Harness Architect, Context Hygiene & Verification Toolkit for AI Coding Agents
**Built by [MUMRO Academy](https://academy.mumro.io) · [RolePlayingTech](https://mumro.io)**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![MUMRO Academy Lesson](https://img.shields.io/badge/MUMRO_Academy-Lesson_13:_Harness_Engineering-ff5a36)](https://academy.mumro.io/lessons/ai-agent-harness-engineering/)

> **`Agent = Model + Harness`**
> Frontier models (Claude, GPT, Gemini) are the engine. The **Harness** is the steering, brakes, context map, tool registry, and deterministic verification loop around that engine.

Instead of writing `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, and verification loops from scratch for every new project, drop **`agent-harness-kit`** into your repository. Your AI agent will **automatically inspect your codebase, ask you 5 architectural questions, and generate a lean, context-efficient harness** tailored to your exact stack.

---

## 🌍 Read in English or Polish / Czytaj po angielsku lub po polsku
* [🇬🇧 English Guide](#-quick-start-30-seconds)
* [🇵🇱 Polska Instrukcja](#-szybki-start-po-polsku-30-sekund)

---

## 🚀 Quick Start (30 Seconds)

### Option A: One-Command Bootstrap into Any Project
Run this inside your new or existing project directory:

```bash
git clone https://github.com/RolePlayingTech/agent-harness-kit.git /tmp/agent-harness-kit && node /tmp/agent-harness-kit/scripts/install-harness-kit.mjs .
```

*(On Windows PowerShell)*:
```powershell
git clone https://github.com/RolePlayingTech/agent-harness-kit.git $env:TEMP\agent-harness-kit; node $env:TEMP\agent-harness-kit\scripts/install-harness-kit.mjs .
```

### Option B: Run the Interactive Architect Interview
Open your AI coding agent (**Google Antigravity**, **Claude Code**, **Cursor**, or **OpenAI Codex**) and prompt:

> *"Use the `harness-architect` skill to inspect this project, interview me, and generate our AI harness."*

### Option C: Audit Your Context Budget Anytime
Verify that your `AGENTS.md` / `CLAUDE.md` files haven't bloated into token-burning encyclopedias:

```bash
node scripts/verify-harness.mjs
```

---

## 📦 What's Inside the Kit?

| Component | Path | Purpose |
| :--- | :--- | :--- |
| **`harness-architect`** | [`skills/harness-architect/SKILL.md`](./skills/harness-architect/SKILL.md) | **Initializer & Interview Skill:** Auto-detects stack (`package.json`, `pyproject.toml`, `Cargo.toml`), asks 5 targeted questions, and scaffolds `<65-line` `AGENTS.md`, `CLAUDE.md`, modular skills, and verification gates. |
| **`context-hygiene`** | [`skills/context-hygiene/SKILL.md`](./skills/context-hygiene/SKILL.md) | **Context Window Protection:** Enforces the 60% RAM ceiling, Progressive Disclosure, Scout Subagent isolation (saving 80–90% tokens), and clean `/compact` handoffs. |
| **`verification-loop`** | [`skills/verification-loop/SKILL.md`](./skills/verification-loop/SKILL.md) | **Default-FAIL Quality Loop:** Prevents premature "early victory" claims by enforcing deterministic compiler/linter/test checks and Fresh-Context Evaluator reviews. |
| **Context Budget Linter** | [`scripts/verify-harness.mjs`](./scripts/verify-harness.mjs) | Zero-dependency Node.js check ensuring root instruction files stay under 80 lines (~450 tokens) and all skills have valid YAML frontmatter. |
| **Reference Blueprints** | [`templates/`](./templates/) | Copy-ready `AGENTS.template.md` and Anthropic-style `feature_list.template.json` multi-session task ledger. |

---

## 🇵🇱 Szybki Start po Polsku (30 Sekund)

Zamiast pisać pliki `AGENTS.md`, `CLAUDE.md` i reguły weryfikacji od zera przy każdym nowym projekcie, pobierz **`agent-harness-kit`**. Twój własny agent AI użyje naszego skilla **`harness-architect`**, przeskanuje projekt, zada Ci **5 konkretnych pytań o architekturę** i wygeneruje gotową, odchudzoną uprząż (Harness).

### Krok 1: Zainstaluj zestaw w swoim projekcie
W katalogu swojego projektu uruchom:

**Windows (PowerShell):**
```powershell
git clone https://github.com/RolePlayingTech/agent-harness-kit.git $env:TEMP\agent-harness-kit; node $env:TEMP\agent-harness-kit\scripts/install-harness-kit.mjs .
```

**macOS / Linux (Bash):**
```bash
git clone https://github.com/RolePlayingTech/agent-harness-kit.git /tmp/agent-harness-kit && node /tmp/agent-harness-kit/scripts/install-harness-kit.mjs .
```

### Krok 2: Uruchom Architekta Uprzęży w swoim agencie AI
Otwórz **Google Antigravity**, **Claude Code**, **Cursor** lub **Codex** i napisz:

> *„Użyj skilla `harness-architect` — przeanalizuj ten projekt, zadaj mi pytania i przygotuj dla nas kompletny harness.”*

### Krok 3: Zweryfikuj budżet kontekstu
W każdej chwili możesz sprawdzić, czy Twój plik `AGENTS.md` / `CLAUDE.md` nie spuchł powyżej 80 linii i nie marnuje tokenów:

```bash
node scripts/verify-harness.mjs
```

---

## 📚 Deep-Dive Tutorial in MUMRO Academy

Want to understand the full engineering science behind **AI Agent Harnesses**, **Context Pollution**, **Subagent Isolation**, and **Prepare → Confirm Governance**?

* 🇬🇧 **Read in English:** [Lesson 13: AI Agent Harness Engineering — From First Principles to Context Mastery](https://academy.mumro.io/lessons/ai-agent-harness-engineering/)
* 🇵🇱 **Czytaj po polsku:** [Lekcja 13: Czym jest AI Harness (Uprząż Agenta) — Od podstaw po oszczędzanie kontekstu i jakość kodu](https://academy.mumro.io/pl/lessons/ai-agent-harness-engineering/)
* 🌐 **Explore MUMRO (The Brand & Content Harness for AI Agents):** [https://mumro.io](https://mumro.io)
