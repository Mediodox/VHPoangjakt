import { NextResponse } from "next/server";
import { getRecentEvents } from "@/lib/public-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "50");
    const events = await getRecentEvents(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? "Failed to fetch events" },
      { status: 500 }
    );
  }
}
