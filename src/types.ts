export interface SyncSettings {
  enabled: boolean;
  threshold: number;
  customKeywords: string[];
  llmEnabled: boolean;
  openaiModel: string;
  llmHideConfidence: number;
  maxLlmCallsPerMonth: number;
}

export interface UsageStats {
  month: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

export interface LlmDecision {
  hide: boolean;
  confidence: number;
  category: string;
  reason: string;
  source: "openai";
  updatedAt: number;
}

export interface LocalSettings {
  openaiApiKey: string;
  llmUsage: UsageStats | null;
  llmCache: Record<string, LlmDecision>;
  blockedCount: number;
}

export interface ClassifyPostMessage {
  type: "CLASSIFY_POST";
  postHash: string;
  score: number;
  text: string;
}

export interface GetUsageMessage {
  type: "GET_USAGE";
}

export interface ClearCacheMessage {
  type: "CLEAR_CACHE";
}

export interface IncrementBlockedMessage {
  type: "INCREMENT_BLOCKED";
}

export interface GetPopupStateMessage {
  type: "GET_POPUP_STATE";
}

export interface SetOpenAiApiKeyMessage {
  type: "SET_OPENAI_API_KEY";
  apiKey: string;
}

export type RuntimeMessage =
  | ClassifyPostMessage
  | GetUsageMessage
  | ClearCacheMessage
  | IncrementBlockedMessage
  | GetPopupStateMessage
  | SetOpenAiApiKeyMessage;

export interface ClassifyResponse {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  cached?: boolean;
  decision?: LlmDecision;
  usage?: UsageStats;
}

export interface UsageResponse {
  ok: boolean;
  reason?: string;
  usage?: UsageStats;
  cacheSize?: number;
}

export interface ClearCacheResponse {
  ok: boolean;
  reason?: string;
}

export interface IncrementBlockedResponse {
  ok: boolean;
  reason?: string;
  blockedCount?: number;
}

export interface PopupStateResponse {
  ok: boolean;
  reason?: string;
  blockedCount?: number;
  hasApiKey?: boolean;
}

export interface SetOpenAiApiKeyResponse {
  ok: boolean;
  reason?: string;
  hasApiKey?: boolean;
}
