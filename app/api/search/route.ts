import { NextResponse } from "next/server";
import { searchGames } from "@/lib/steam";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const items = await searchGames(q.slice(0, 80));
  return NextResponse.json({ items });
}
