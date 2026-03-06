import crypto from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { parseCaptionToCandidate } from "@/lib/point-parser";

type SourcePost = {
  postUrl: string;
  caption: string | null;
  mediaUrl?: string | null;
  postedAt: string;
  externalId?: string;
  raw?: unknown;
};

type ActiveClass = {
  id: string;
  name: string;
  instagram_handle: string;
};

type ActiveChallenge = {
  id: string;
  title: string;
  tags: string[] | null;
  default_points: number;
};

type IngestStats = {
  scannedHandles: number;
  fetchedPosts: number;
  insertedRawPosts: number;
  candidatesCreated: number;
  candidatesSkipped: number;
  errors: string[];
};

function buildFingerprint(handle: string, postUrl: string, externalId?: string) {
  const value = externalId?.trim() || `${handle.toLowerCase()}::${postUrl}`;
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function fetchPostsForHandle(handle: string): Promise<SourcePost[]> {
  const sourceEndpoint = process.env.INSTAGRAM_SOURCE_ENDPOINT;
  if (!sourceEndpoint) {
    throw new Error("Missing INSTAGRAM_SOURCE_ENDPOINT");
  }

  const apiKey = process.env.INSTAGRAM_SOURCE_API_KEY;
  const url = new URL(sourceEndpoint);
  url.searchParams.set("handle", handle);

  const response = await fetch(url.toString(), {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Source fetch failed (${response.status}) for @${handle}`);
  }

  const payload = (await response.json()) as { posts?: SourcePost[] };
  return payload.posts ?? [];
}

export async function runIngestJob(): Promise<IngestStats> {
  const supabase = getServiceSupabase();
  const stats: IngestStats = {
    scannedHandles: 0,
    fetchedPosts: 0,
    insertedRawPosts: 0,
    candidatesCreated: 0,
    candidatesSkipped: 0,
    errors: []
  };

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id, name, instagram_handle")
    .eq("active", true);
  if (classesError) throw classesError;

  const { data: challenges, error: challengeError } = await supabase
    .from("challenges")
    .select("id, title, tags, default_points")
    .eq("active", true);
  if (challengeError) throw challengeError;

  for (const schoolClass of (classes ?? []) as ActiveClass[]) {
    stats.scannedHandles += 1;
    try {
      const posts = await fetchPostsForHandle(schoolClass.instagram_handle);
      stats.fetchedPosts += posts.length;

      for (const post of posts) {
        const fingerprint = buildFingerprint(
          schoolClass.instagram_handle,
          post.postUrl,
          post.externalId
        );

        const { data: insertedRaw, error: rawError } = await supabase
          .from("instagram_posts_raw")
          .upsert(
            {
              source_handle: schoolClass.instagram_handle,
              post_url: post.postUrl,
              media_url: post.mediaUrl ?? null,
              caption: post.caption ?? "",
              posted_at: post.postedAt,
              fingerprint,
              payload: post.raw ?? {}
            },
            { onConflict: "fingerprint" }
          )
          .select("id")
          .single();

        if (rawError) {
          stats.errors.push(
            `Raw post upsert failed for @${schoolClass.instagram_handle}: ${rawError.message}`
          );
          continue;
        }
        stats.insertedRawPosts += 1;

        const parsed = parseCaptionToCandidate(
          post.caption,
          (challenges ?? []) as ActiveChallenge[]
        );
        if (!parsed.isCandidate) {
          stats.candidatesSkipped += 1;
          continue;
        }

        const { data: existingCandidate, error: existingError } = await supabase
          .from("point_candidates")
          .select("id")
          .eq("instagram_post_id", insertedRaw.id)
          .maybeSingle();

        if (existingError) {
          stats.errors.push(
            `Candidate lookup failed for post ${insertedRaw.id}: ${existingError.message}`
          );
          continue;
        }
        if (existingCandidate) {
          stats.candidatesSkipped += 1;
          continue;
        }

        const { error: insertCandidateError } = await supabase
          .from("point_candidates")
          .insert({
            class_id: schoolClass.id,
            challenge_id: parsed.challengeId,
            instagram_post_id: insertedRaw.id,
            parsed_points: parsed.points,
            confidence: parsed.confidence,
            parser_notes: parsed.notes,
            status: "pending"
          });
        if (insertCandidateError) {
          stats.errors.push(
            `Candidate insert failed for post ${insertedRaw.id}: ${insertCandidateError.message}`
          );
          continue;
        }
        stats.candidatesCreated += 1;
      }
    } catch (error) {
      stats.errors.push(
        `Ingest failed for @${schoolClass.instagram_handle}: ${(error as Error).message}`
      );
    }
  }

  return stats;
}
