import logging
import time

from config import configure_logging, load_settings
from database import SupabaseDB
from leaderboard import ProcessStats, process_post
from ocr import ChallengeOCR
from scraper import InstagramScraper


LOGGER = logging.getLogger(__name__)


def run_cycle(db: SupabaseDB, scraper: InstagramScraper, ocr_engine: ChallengeOCR, settings) -> None:
    stats = ProcessStats()
    classes = db.get_active_classes()
    challenge_map = db.get_challenge_map()

    LOGGER.info("Cycle start classes=%s challenge_mappings=%s", len(classes), len(challenge_map))

    for class_index, class_row in enumerate(classes):
        try:
            posts = scraper.fetch_recent_posts(
                class_row.instagram_handle,
                settings.max_posts_per_account,
            )
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Failed to fetch posts for @%s: %s", class_row.instagram_handle, exc)
            continue

        for post in posts:
            try:
                process_post(
                    db=db,
                    ocr_engine=ocr_engine,
                    challenge_map=challenge_map,
                    class_row=class_row,
                    post=post,
                    tmp_dir=settings.tmp_dir,
                    request_timeout_seconds=settings.request_timeout_seconds,
                    dry_run=settings.dry_run,
                    stats=stats,
                )
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("Failed processing post shortcode=%s: %s", post.shortcode, exc)
            if settings.delay_between_posts_seconds > 0:
                time.sleep(settings.delay_between_posts_seconds)

        if (
            settings.delay_between_accounts_seconds > 0
            and class_index < len(classes) - 1
        ):
            time.sleep(settings.delay_between_accounts_seconds)

    LOGGER.info(
        (
            "Cycle done processed=%s skipped_existing=%s skipped_ocr=%s "
            "skipped_mapping=%s events_created=%s points_from_ocr=%s points_from_mapping=%s"
        ),
        stats.processed,
        stats.skipped_existing,
        stats.skipped_ocr,
        stats.skipped_mapping,
        stats.points_events_created,
        stats.points_from_ocr,
        stats.points_from_mapping,
    )


def main() -> None:
    settings = load_settings()
    configure_logging(settings.log_level)

    db = SupabaseDB(
        base_url=settings.supabase_url,
        service_role_key=settings.supabase_service_role_key,
        timeout_seconds=settings.request_timeout_seconds,
    )
    scraper = InstagramScraper(
        session_file=str(settings.instaloader_session_file)
        if settings.instaloader_session_file
        else None,
        login_username=settings.instaloader_login_username,
        login_password=settings.instaloader_login_password,
    )
    ocr_engine = ChallengeOCR(tesseract_cmd=settings.tesseract_cmd)

    if settings.run_once:
        run_cycle(db, scraper, ocr_engine, settings)
        return

    while True:
        cycle_start = time.time()
        try:
            run_cycle(db, scraper, ocr_engine, settings)
        except Exception as exc:  # noqa: BLE001
            LOGGER.exception("Worker cycle failed: %s", exc)

        elapsed = max(0, int(time.time() - cycle_start))
        wait_seconds = max(1, settings.check_interval_seconds - elapsed)
        LOGGER.info("Sleeping for %s seconds", wait_seconds)
        time.sleep(wait_seconds)


if __name__ == "__main__":
    main()
