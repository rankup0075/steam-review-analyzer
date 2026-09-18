import { NextResponse } from "next/server";
import { LlmError } from "./llm";

export function errorResponse(err: unknown) {
  const status = err instanceof LlmError ? err.status : 500;
  const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했어요.";
  return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
}

export const badRequest = (message: string) => NextResponse.json({ error: message }, { status: 400 });
