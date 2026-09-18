/**
 * 범용 LLM 호출 모듈.
 * 모든 기능(리뷰 분석, 회의록 정리 등)은 이 함수 하나로 "프롬프트 + JSON 스키마 → 타입이 있는 결과"를 받는다.
 * 모델/공급자를 바꾸고 싶으면 이 파일만 수정하면 된다.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** 모델 하나당 시도 횟수 */
const ATTEMPTS_PER_MODEL = 2;
/** 요청 하나가 응답 없이 멈춰 있는 경우를 끊는 시간 */
const REQUEST_TIMEOUT_MS = 40_000;
/** GEMINI_MODEL이 없을 때 쓰는 모델 목록. 앞의 모델이 붐비면 다음 모델로 넘어간다. */
const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];

export class LlmError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

/** Gemini responseSchema (OpenAPI 부분집합) */
export type JsonSchema = Record<string, unknown>;

interface GenerateJsonOptions {
  system: string;
  prompt: string;
  schema: JsonSchema;
  temperature?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stripFences(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

/** "모델A,모델B" 형태의 환경 변수를 모델 목록으로 */
function getModels() {
  const fromEnv = (process.env.GEMINI_MODEL ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

type Attempt = { ok: true; text: string } | { ok: false; retry: boolean; message: string };

async function callModel(model: string, apiKey: string, body: unknown): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, retry: false, message: "AI 서버가 제시간에 응답하지 않았어요." }; // 멈춘 모델은 바로 다음 모델로
  }

  if (res.status === 429) {
    return {
      ok: false,
      retry: false,
      message: "무료 사용량 한도에 걸렸어요. 1분쯤 뒤에 다시 시도하거나 분석할 리뷰 수를 줄여 주세요.",
    };
  }
  if (res.status >= 500) {
    return { ok: false, retry: true, message: "AI 서버가 붐벼요. 잠시 후 다시 시도해 주세요." };
  }
  // 404: 모델이 없거나 이 계정에서 못 쓰는 모델 → 다음 모델로
  if (res.status === 404) {
    return { ok: false, retry: false, message: `모델 ${model}을(를) 쓸 수 없어요.` };
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new LlmError(`Gemini API 오류 (${res.status}): ${detail.slice(0, 300)}`, res.status);
  }

  const data = await res.json();
  const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text) return { ok: false, retry: true, message: "AI 응답이 비어 있어요." };
  return { ok: true, text };
}

export async function generateJson<T>({
  system,
  prompt,
  schema,
  temperature = 0.2,
}: GenerateJsonOptions): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new LlmError(
      "GEMINI_API_KEY가 설정되지 않았어요. .env.local 파일에 키를 넣고 서버를 다시 시작해 주세요.",
      500,
    );
  }

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };

  let lastError = "AI 서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요.";

  // 모델 목록을 차례로 시도: 붐비거나(5xx) 한도 초과(429)·사용 불가(404)면 다음 모델로 넘어간다
  for (const model of getModels()) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_MODEL; attempt++) {
      if (attempt > 0) await sleep(2000 * attempt);

      const result = await callModel(model, apiKey, body);
      if (result.ok) {
        try {
          return JSON.parse(stripFences(result.text)) as T;
        } catch {
          lastError = "AI 응답을 JSON으로 읽지 못했어요.";
          continue;
        }
      }

      lastError = result.message;
      if (!result.retry) break;
    }
    // 이 모델에서 실패 → 다음 모델
  }

  throw new LlmError(lastError, 503);
}
