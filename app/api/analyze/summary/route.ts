import { NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/http";
import { summarizeReviews, type ReviewMeta } from "@/lib/review-analysis";
import type { ClassifiedReview } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { gameName, classified, meta } = (await req.json()) as {
      gameName?: string;
      classified?: ClassifiedReview[];
      meta?: Record<string, ReviewMeta>;
    };
    if (!Array.isArray(classified) || classified.length === 0 || !meta) {
      return badRequest("요약할 분류 결과가 없어요.");
    }
    if (classified.length > 300) return badRequest("리뷰가 너무 많아요. 300건 이하로 줄여 주세요.");

    const summary = await summarizeReviews({ name: gameName ?? "알 수 없는 게임" }, classified, meta);
    return NextResponse.json(summary);
  } catch (err) {
    return errorResponse(err);
  }
}
