import { NextResponse } from "next/server";
import { findGames } from "@/lib/game-search";

export const maxDuration = 30;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const result = await findGames(q.slice(0, 80));
  return NextResponse.json(result);
}
