import { NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/http";
import { CLASSIFY_BATCH_SIZE, classifyReviews } from "@/lib/review-analysis";
import type { SteamReview } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { reviews } = (await req.json()) as { reviews?: SteamReview[] };
    if (!Array.isArray(reviews) || reviews.length === 0) return badRequest("분류할 리뷰가 없어요.");
    if (reviews.length > CLASSIFY_BATCH_SIZE) return badRequest(`한 번에 ${CLASSIFY_BATCH_SIZE}개까지 분류할 수 있어요.`);

    const results = await classifyReviews(reviews);
    return NextResponse.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
}
