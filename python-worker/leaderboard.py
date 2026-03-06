import hashlib
import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from database import ChallengeMapping, ClassRow, SupabaseDB
from ocr import ChallengeOCR
from scraper import ScrapedPost


LOGGER = logging.getLogger(__name__)


@dataclass
class ProcessStats:
    processed: int = 0
    skipped_existing: int = 0
    skipped_ocr: int = 0
    skipped_mapping: int = 0
    points_events_created: int = 0
    points_from_ocr: int = 0
    points_from_mapping: int = 0


def _fingerprint(handle: str, shortcode: str) -> str:
    value = f"{handle.lower()}::{shortcode}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _download_image(media_url: str, tmp_dir: Path, timeout_seconds: int) -> Path:
    tmp_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=tmp_dir, suffix=".jpg", delete=False) as temp_file:
        response = requests.get(media_url, timeout=timeout_seconds)
        response.raise_for_status()
        temp_file.write(response.content)
        return Path(temp_file.name)


def process_post(
    db: SupabaseDB,
    ocr_engine: ChallengeOCR,
    challenge_map: dict[int, ChallengeMapping],
    class_row: ClassRow,
    post: ScrapedPost,
    tmp_dir: Path,
    request_timeout_seconds: int,
    dry_run: bool,
    stats: ProcessStats,
) -> None:
    fingerprint = _fingerprint(class_row.instagram_handle, post.shortcode)

    if db.is_post_processed(fingerprint):
        stats.skipped_existing += 1
        return

    image_path: Path | None = None
    ocr_text = ""
    challenge_number: int | None = None
    points_value: int | None = None
    ingest_error: str | None = None
    source_post_id: str | None = None

    try:
        if not post.media_url:
            raise RuntimeError("Post has no image URL")
        image_path = _download_image(post.media_url, tmp_dir, request_timeout_seconds)
        ocr_result = ocr_engine.detect_fields(str(image_path))
        ocr_text = ocr_result.extracted_text
        challenge_number = ocr_result.challenge_number
        points_value = ocr_result.points_value
    except Exception as exc:  # noqa: BLE001
        ingest_error = f"OCR/download failed: {exc}"
        LOGGER.warning("Post OCR/download failed shortcode=%s error=%s", post.shortcode, exc)
    finally:
        if image_path and image_path.exists():
            image_path.unlink(missing_ok=True)

    challenge = challenge_map.get(challenge_number) if challenge_number is not None else None
    resolved_points = points_value if points_value is not None else (challenge.points if challenge else None)

    if challenge_number is None:
        stats.skipped_ocr += 1
    if resolved_points is None:
        stats.skipped_mapping += 1

    payload: dict[str, Any] = {
        "shortcode": post.shortcode,
        "challenge_number": challenge_number,
        "points_value": points_value,
        "ocr_text": ocr_text,
        "source": "python-worker",
    }

    if dry_run:
        LOGGER.info(
            "Dry run post=%s class=%s challenge=%s",
            post.shortcode,
            class_row.instagram_handle,
            challenge_number,
        )
        stats.processed += 1
        return

    source_post_id = db.insert_raw_post(
        source_handle=class_row.instagram_handle,
        post_url=post.post_url,
        media_url=post.media_url,
        caption=post.caption,
        posted_at_iso=post.posted_at_iso,
        fingerprint=fingerprint,
        payload=payload,
        ingest_error=ingest_error,
    )

    if resolved_points is not None:
        reason_parts = []
        if challenge_number is not None:
            reason_parts.append(f"OCR challenge #{challenge_number}")
        else:
            reason_parts.append("OCR-detected challenge post")
        reason_parts.append("from Instagram")
        if points_value is not None:
            reason_parts.append("(points from image)")
        elif challenge is not None:
            reason_parts.append("(points from challenge map)")
        reason = " ".join(reason_parts)

        db.insert_point_event(
            class_id=class_row.id,
            challenge_id=challenge.challenge_id if challenge else None,
            points=resolved_points,
            reason=reason,
            source_post_id=source_post_id,
        )
        stats.points_events_created += 1
        if points_value is not None:
            stats.points_from_ocr += 1
        else:
            stats.points_from_mapping += 1

    stats.processed += 1
