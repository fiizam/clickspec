# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-03

### Added
- **Core CLI & Browser Interceptor:**
  - Launch interactive Chromium session to record clicks, form entries, selects, and page navigations.
  - Real-time in-page observer capturing accessible roles, labels, and text content.
- **Smart Mutation & Assertion Watcher:**
  - Detect post-interaction DOM state changes (toast notifications, dialogs, error banners, and URL routing transitions).
  - Automatically synthesize corresponding Playwright assertions (`expect(page).toHaveURL(...)`, `expect(...).toBeVisible()`, `expect(...).toContainText(...)`).
- **Event Normalizer & Debouncer:**
  - Collapse burst typing into atomic `page.fill()` actions.
  - Deduplicate accidental double-clicks and consecutive identical navigations to minimize LLM token overhead.
- **AI Code Synthesis Engine:**
  - Gemini 3.8 Flash support via the official `@google/genai` SDK.
  - Seamless OpenAI / Groq / DeepSeek / Ollama fallback support via `openai` SDK.
  - Strict zero-hallucination prompting enforcing user-facing accessible locators (`getByRole`, `getByLabel`, `getByTestId`).
- **Page Object Model (POM) Mode (`--pom`):**
  - Synthesize structured Page Object classes (`pages/<PageName>.ts`) containing locators and reusable action methods.
  - Generate corresponding spec files (`tests/<SpecName>.spec.ts`) instantiating the Page Object.
  - Custom destination override with `--page-path <path>`.
- **Documentation & Interactive Showcase:**
  - Warm, clean developer landing page deployed at [https://clicktest.my.id](https://clicktest.my.id).
  - Interactive code preview with tab switcher between Standard Spec and Page Object Model.
  - OpenGraph & Twitter Card social preview images for link sharing.
- **Automated CI Matrix:**
  - GitHub Actions matrix workflow verifying Node.js 20.x and 22.x LTS.
  - Full test suite covering normalizer, prompt compiler, formatter heuristics, and live browser sessions.
