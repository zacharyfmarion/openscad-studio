# Issue 125: OpenAI-Compatible Local Provider Support

## Goal

Add first-class support for local and self-hosted OpenAI-compatible chat providers, with Ollama, llama.cpp, and LM Studio as the primary target servers. This addresses issue #125, where users currently only see API-key settings for hosted Anthropic/OpenAI models and have no obvious way to use local models.

The intended user-facing outcome is a configurable "OpenAI-compatible" provider in AI settings:

- Base URL, for example `http://127.0.0.1:11434/v1` for Ollama, `http://127.0.0.1:8080/v1` for llama.cpp, or `http://localhost:1234/v1` for LM Studio.
- Model id/name, for example `gemma4:12b` or the model id reported by the local server.
- Optional API key for servers that require one.
- Model refresh/test behavior that works against `/models` when available.

## Issue Context

The issue asks for "Ollama / Llama.cpp" support. A later clarification narrows the requested shape to local OpenAI-compatible providers with configurable base URL, model name, and optional API key, especially for the desktop app.

This should be implemented as one generic OpenAI-compatible provider rather than separate hardcoded "Ollama", "llama.cpp", or "LM Studio" providers. Ollama, llama.cpp, and LM Studio should appear in copy, defaults, examples, tests, and manual validation.

## Current State

The AI copilot runs entirely in the frontend for both web and desktop builds.

Relevant current files:

- `apps/ui/src/stores/apiKeyStore.ts`
  - Stores only Anthropic and OpenAI API keys.
  - Defines `AiProvider = 'anthropic' | 'openai'`.
  - Persists only a bare model id string.
  - Infers the provider from the model id prefix.
- `apps/ui/src/utils/aiModels.ts`
  - Knows only Anthropic and OpenAI model catalogs and provider ordering.
- `apps/ui/src/hooks/useModels.ts`
  - Fetches Anthropic models from Anthropic's API.
  - Fetches OpenAI models from `https://api.openai.com/v1/models`.
  - Filters OpenAI models to known useful hosted model families.
- `apps/ui/src/services/aiService.ts`
  - Creates Anthropic models with `createAnthropic`.
  - Creates OpenAI models with `createOpenAI({ apiKey })`.
- `apps/ui/src/hooks/useAiAgent.ts`
  - Resolves provider from the selected model id.
  - Requires an API key before streaming.
  - Sends analytics using provider inferred from model id.
- `apps/ui/src/components/settings/AiSettings.tsx`
  - Presents only Anthropic/OpenAI API-key cards.
- `apps/ui/src/components/ModelSelector.tsx`
  - Groups models only by Anthropic and OpenAI.
- `apps/ui/src/hooks/useOpenScad.ts`
  - Records AI edit render analytics using the stored bare model id and inferred provider.

The main architectural problem is that a model id currently implies its provider. That breaks for local model names like `gemma4:12b`, `qwen3-coder`, an LM Studio loaded-model id, or a llama.cpp server model alias.

## Local Test Baseline

The local machine has Ollama available for validation.

Observed local Ollama behavior:

- `ollama list` reports `gemma4:12b`.
- `GET http://127.0.0.1:11434/v1/models` reports `gemma4:12b`.
- Browser-style CORS preflight from `http://localhost:1420` to `http://127.0.0.1:11434/v1/chat/completions` succeeds.
- `POST /v1/chat/completions` returns normal assistant text.
- A request with OpenAI-style `tools` returns OpenAI-style `tool_calls`.
- Responses may include separate reasoning content. The current stream reducer already ignores AI SDK reasoning chunks, which should remain the default behavior.

## Design Principles

1. Treat self-hosted support as OpenAI-compatible, not Ollama-specific.
2. Do not regress Anthropic or hosted OpenAI behavior.
3. Do not rely on model-id prefixes for request routing.
4. Keep API keys optional for the custom provider.
5. Keep local provider configuration local-only and marked `ph-no-capture`.
6. Prefer desktop support first, while allowing the web build to attempt compatible URLs when CORS allows it.
7. Make the feature understandable to hobbyist makers: one small, practical settings card with tested defaults, not provider jargon spread across the app.

## Proposed Data Model

Introduce an explicit model selection shape:

```ts
export type AiProvider = 'anthropic' | 'openai' | 'openai-compatible';

export interface AiModelSelection {
  provider: AiProvider;
  modelId: string;
}
```

Persist the new selection in local storage under a new key, while migrating legacy bare model ids:

- Legacy `claude*`/`anthropic*` model ids become `{ provider: 'anthropic', modelId }`.
- Legacy `gpt*`/`o1*`/`o3*`/`chatgpt*` model ids become `{ provider: 'openai', modelId }`.
- Unknown legacy ids should not silently become Anthropic. Prefer resolving to the first configured provider, or fall back to the preferred default.

Add a custom provider config shape:

```ts
export interface OpenAiCompatibleConfig {
  baseUrl: string;
  modelId: string;
  apiKey: string | null;
}
```

Suggested storage keys:

- `openscad_studio_ai_model_selection`
- `openscad_studio_openai_compatible_base_url`
- `openscad_studio_openai_compatible_model`
- `openscad_studio_openai_compatible_api_key`

Keep the existing hosted provider key storage and obfuscation behavior.

## Implementation Plan

### 1. Refactor provider and model selection storage

- [x] Extend `AiProvider` to include `openai-compatible`.
- [x] Add `AiModelSelection` helpers in `apiKeyStore.ts`.
- [x] Add `getStoredModelSelection()` and `setStoredModelSelection()`.
- [x] Keep `getStoredModel()` temporarily as a compatibility helper if needed by existing callers, but migrate internal AI flow to explicit selection.
- [x] Replace provider inference in AI request paths with stored/current selection provider.
- [x] Keep `getProviderFromModel()` only for legacy migration and any unavoidable compatibility code.
- [x] Update tests in `apps/ui/src/stores/__tests__/apiKeyStore.test.tsx`.

### 2. Add OpenAI-compatible provider configuration

- [x] Add storage helpers for custom base URL, model id, and optional key.
- [x] Normalize base URLs by trimming whitespace and removing trailing slashes.
- [x] Treat the provider as available when it has a valid base URL and model id.
- [x] Do not require a non-empty API key for provider availability.
- [x] Use a placeholder key such as `local` or no Authorization header depending on provider factory behavior; avoid blocking on missing key.
- [x] Add unit coverage for optional-key availability.

### 3. Update model creation

- [x] Update `createModel()` in `aiService.ts` to accept a model selection/config object or provider plus resolved provider config.
- [x] For Anthropic, preserve existing `createAnthropic` behavior and browser access header.
- [x] For hosted OpenAI, preserve existing `createOpenAI({ apiKey })` behavior.
- [x] For OpenAI-compatible providers, create a provider with the configured `baseURL`, optional `apiKey`, and a non-hosted provider name such as `openai-compatible`.
- [x] Force the custom provider through the Chat Completions model factory, for example `.chat(modelId)`, rather than relying on the OpenAI provider default API selection.
- [x] Add tests verifying the custom provider receives base URL, model id, and optional API key.

### 4. Update model listing

- [x] Extend `ModelInfo.provider` and `GroupedModels` for `openai-compatible`.
- [x] Add a generic fetcher for `${baseUrl}/models`.
- [x] Do not apply hosted OpenAI relevance filtering to custom provider models.
- [x] If `/models` fails but a custom model id is configured, show the configured model as a fallback option with a warning toast.
- [x] Store model cache per provider/base URL combination so a hosted OpenAI cache cannot satisfy a custom provider request.
- [x] Update `useModels` tests for custom model fetch, fallback configured model, cache isolation, and provider shrink behavior.

### 5. Update settings UI

- [x] Add an OpenAI-compatible settings card in `AiSettings.tsx`.
- [x] Include fields for Base URL, Model, and optional API key.
- [x] Default the base URL to `http://127.0.0.1:11434/v1` for Ollama.
- [x] Include concise helper copy mentioning Ollama, llama.cpp, and LM Studio examples.
- [x] Add a "Test connection" or "Refresh models" control that fetches `/models` and shows success/failure.
- [x] Keep all local provider fields under `ph-no-capture`.
- [x] Update save button behavior so AI settings can save API keys and custom provider config without confusing "Save Key" copy.
- [x] Add component coverage in `SettingsDialog.test.tsx`.

### 6. Update model selector and access states

- [x] Update `ModelSelector.tsx` to show an "OpenAI-compatible" group.
- [x] Ensure select item values remain unique even if two providers expose the same model id.
- [x] Prefer storing selection as provider+model rather than overloading select values with raw model ids.
- [x] Update empty states from "No API keys" to "No AI provider configured" where appropriate.
- [x] Update `WelcomeScreen`, `AiPromptPanel`, and `AiAccessEmptyState` copy to mention local/OpenAI-compatible configuration without making the UI feel AI-generic.
- [x] Add component tests for a configured local provider appearing without an API key.

### 7. Update AI request flow

- [x] Update `useAiAgent.ts` state from `currentModel: string` to explicit current selection, or add `currentProvider` alongside `currentModel`.
- [x] Resolve provider config before submit.
- [x] For Anthropic/OpenAI, keep missing-key validation.
- [x] For OpenAI-compatible, validate base URL/model id and allow missing API key.
- [x] Track analytics with explicit provider and model id.
- [x] Avoid sending the local base URL or API key to analytics.
- [x] Update `useOpenScad.ts` AI edit analytics to use explicit provider selection.
- [x] Keep reasoning chunks ignored in `aiTurnState.ts`.
- [x] Add tests for submitting with a local provider and no API key.

### 8. Desktop and web behavior

- [ ] Support desktop as the primary path.
- [ ] Allow web builds to use OpenAI-compatible endpoints when CORS permits, which Ollama currently appears to permit for localhost.
- [ ] If fetch fails with a CORS/network-like error, show a targeted message explaining that the local server must be running and allow browser requests.
- [ ] Avoid adding a Rust/Tauri proxy in the first implementation unless browser fetch proves unreliable in packaged desktop.
- [ ] If a Tauri proxy becomes necessary, add it as a follow-up implementation plan rather than hiding it in this feature.

### 9. Documentation and issue response

- [ ] Add concise user-facing docs in an appropriate developer/user doc if the project has a current AI settings guide.
- [ ] Do not expand top-level `README.md` into an engineering index.
- [ ] When implementation ships, reply to issue #125 explaining the OpenAI-compatible setup:
  - Ollama: `ollama serve`, `ollama pull <model>`, base URL `http://127.0.0.1:11434/v1`.
  - llama.cpp: run `llama-server`, base URL `http://127.0.0.1:8080/v1`.
  - LM Studio: start the Local Server from LM Studio, load a model, base URL `http://localhost:1234/v1`.

## Acceptance Criteria

- [ ] A user can configure Ollama in Settings with base URL `http://127.0.0.1:11434/v1`, model `gemma4:12b`, and no API key.
- [ ] The configured local model appears in the model selector.
- [ ] The AI assistant can send a normal chat request to the local model.
- [ ] The AI assistant can execute the existing local tool flow with a compatible model that emits OpenAI-style tool calls.
- [ ] Anthropic and hosted OpenAI model selection still work.
- [ ] Legacy stored model ids migrate without losing the selected hosted model.
- [ ] Local provider configuration is not captured by analytics.
- [ ] Error messages distinguish missing hosted API keys from missing or unreachable local provider config.

## Validation Plan

Automated validation:

- [ ] `pnpm --filter ui test -- src/stores/__tests__/apiKeyStore.test.tsx`
- [ ] `pnpm --filter ui test -- src/hooks/__tests__/useModels.test.tsx`
- [ ] `pnpm --filter ui test -- src/components/__tests__/ModelSelector.test.tsx`
- [ ] `pnpm --filter ui test -- src/components/__tests__/SettingsDialog.test.tsx`
- [ ] `pnpm --filter ui test -- src/hooks/__tests__/useAiAgent.test.tsx`
- [ ] `pnpm type-check`
- [ ] `bash scripts/validate-changes.sh --scope baseline`

Manual validation with local Ollama:

- [ ] Confirm `ollama list` includes the target model.
- [ ] Confirm `GET http://127.0.0.1:11434/v1/models` returns the target model.
- [ ] Configure OpenAI-compatible provider in Settings.
- [ ] Refresh models and confirm the local model appears.
- [ ] Send a simple chat prompt and confirm the response streams.
- [ ] Ask the assistant to inspect the current project and confirm `get_project_context` is called.
- [ ] Ask for a small safe OpenSCAD edit and confirm `apply_edit` plus diagnostics flow still works.

Manual validation with llama.cpp, if available:

- [ ] Start `llama-server` with an instruction/chat model and OpenAI-compatible API enabled.
- [ ] Configure base URL `http://127.0.0.1:8080/v1`.
- [ ] Confirm the configured model can stream a basic response.
- [ ] Confirm tool calling behavior for a model/template that supports it, or document the server/model limitation.

Manual validation with LM Studio, if available:

- [ ] Start LM Studio's Local Server.
- [ ] Load a chat/instruction model in LM Studio.
- [ ] Configure base URL `http://localhost:1234/v1`.
- [ ] Refresh models and confirm the loaded LM Studio model appears.
- [ ] Confirm the configured model can stream a basic response.
- [ ] Confirm tool calling behavior for a model/template that supports it, or document the server/model limitation.

## Risks and Mitigations

- Some local models do not support tools reliably.
  - Mitigation: support the provider generally, but document that edit workflows require function/tool calling support.
- OpenAI provider defaults may select the Responses API.
  - Mitigation: force OpenAI-compatible providers through Chat Completions.
- Browser CORS can vary by local server.
  - Mitigation: desktop-first support, targeted error copy, and possible later Tauri proxy if needed.
- Multiple providers can expose the same model id.
  - Mitigation: persist provider+model selection, not just model id.
- Local reasoning output may pollute the transcript.
  - Mitigation: keep reasoning chunks ignored unless a future UI explicitly exposes them.

## Open Questions

- Should the settings card be shown in web builds, or only desktop builds with a note that hosted web may depend on CORS?
- Should there be named presets for Ollama, llama.cpp, and LM Studio, or should the first version stay as one generic OpenAI-compatible card with example placeholders?
- Should custom provider model refresh be automatic on settings save, or only user-triggered to avoid slow local model startup calls?
- Should multiple custom OpenAI-compatible providers be supported now, or should v1 support one configured provider only?
