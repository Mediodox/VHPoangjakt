import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const leaderboard = await getLeaderboard();
    return NextResponse.json({ leaderboard });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
