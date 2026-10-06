/**
 * AI Provider abstraction for OpenStock.
 *
 * Supports multiple LLM backends via the AI_PROVIDER environment variable:
 *   - "openrouter" (default) – OpenRouter (OpenAI-compatible), model from QUICK_THINK_LLM
 *   - "gemini"   – Google Gemini REST API
 *   - "minimax"  – MiniMax (OpenAI-compatible)
 *   - "siray"    – Siray.ai (OpenAI-compatible)
 *
 * Each provider returns a plain-text string from the model.
 */

export type AIProviderName = "openrouter" | "gemini" | "minimax" | "siray";

export interface AIProviderConfig {
  name: AIProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Resolve the provider configuration from environment variables.
 */
export function getProviderConfig(
  provider?: AIProviderName
): AIProviderConfig {
  const name =
    provider ||
    (process.env.AI_PROVIDER as AIProviderName) ||
    "openrouter";

  switch (name) {
    case "openrouter":
      return {
        name: "openrouter",
        apiKey: process.env.OPENROUTER_API_KEY || "",
        baseUrl:
          process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
        // The OpenRouter model slug to think with, e.g. "deepseek/deepseek-v4.1-flash"
        model: process.env.QUICK_THINK_LLM || "",
      };

    case "minimax":
      return {
        name: "minimax",
        apiKey: process.env.MINIMAX_API_KEY || "",
        baseUrl:
          process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1",
        // Defaults to the current MiniMax-M3 model. Set MINIMAX_MODEL to
        // select another model (e.g. the previous MiniMax-M2.7).
        model: process.env.MINIMAX_MODEL || "MiniMax-M3",
      };

    case "siray":
      return {
        name: "siray",
        apiKey: process.env.SIRAY_API_KEY || "",
        baseUrl: "https://api.siray.ai/v1",
        model: "siray-1.0-ultra",
      };

    case "gemini":
    default:
      return {
        name: "gemini",
        apiKey: process.env.GEMINI_API_KEY || "",
        baseUrl:
          "https://generativelanguage.googleapis.com/v1beta/models",
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      };
  }
}

const FALLBACK_ORDER: AIProviderName[] = ["gemini", "minimax", "siray"];

const API_KEY_ENV: Record<AIProviderName, string> = {
  openrouter: "OPENROUTER_API_KEY",
  gemini: "GEMINI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  siray: "SIRAY_API_KEY",
};

/**
 * Get the fallback provider. Never returns the primary itself; prefers the first
 * remaining provider that has a key set, so an unconfigured name is not chosen.
 */
export function getFallbackProviderName(
  primary: AIProviderName
): AIProviderName {
  const candidates =
    primary === "openrouter"
      ? FALLBACK_ORDER
      : FALLBACK_ORDER.filter((name) => name !== primary);
  return (
    candidates.find((name) => process.env[API_KEY_ENV[name]]) ??
    candidates[0] ??
    "gemini"
  );
}

// ── Provider call implementations ──────────────────────────────────

async function callGemini(
  prompt: string,
  config: AIProviderConfig
): Promise<string> {
  if (!config.apiKey) throw new Error("GEMINI_API_KEY is not set");

  const url = `${config.baseUrl}/${config.model}:generateContent?key=${config.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function callOpenAICompatible(
  prompt: string,
  config: AIProviderConfig
): Promise<string> {
  if (!config.apiKey) {
    throw new Error(
      `${config.name.toUpperCase()}_API_KEY is not set`
    );
  }

  if (!config.model) {
    throw new Error(
      config.name === "openrouter"
        ? "QUICK_THINK_LLM is not set"
        : `${config.name} model is not set`
    );
  }

  const url = `${config.baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `${config.name} API error: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`${config.name} returned empty response`);
  }
  return text;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Call the configured (or specified) AI provider and return the model
 * response as a plain string.
 */
export async function callAIProvider(
  prompt: string,
  provider?: AIProviderName
): Promise<string> {
  const config = getProviderConfig(provider);

  if (config.name === "gemini") {
    return callGemini(prompt, config);
  }
  // MiniMax and Siray both use OpenAI-compatible endpoints
  return callOpenAICompatible(prompt, config);
}

/**
 * Call the AI provider with automatic fallback.
 * Tries the primary provider first; on failure switches to the fallback.
 */
export async function callAIProviderWithFallback(
  prompt: string
): Promise<string> {
  const primaryName =
    (process.env.AI_PROVIDER as AIProviderName) || "openrouter";
  const fallbackName = getFallbackProviderName(primaryName);

  try {
    return await callAIProvider(prompt, primaryName);
  } catch (primaryError) {
    console.error(
      `⚠️ ${primaryName} failed, switching to ${fallbackName} fallback`,
      primaryError
    );
    return await callAIProvider(prompt, fallbackName);
  }
}
