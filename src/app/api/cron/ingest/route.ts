import { NextResponse } from "next/server";
import { runIngestJob } from "@/lib/instagram-ingest";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await runIngestJob();
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message ?? "Ingest failed" },
      { status: 500 }
    );
  }
}
