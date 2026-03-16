import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import instaloader


LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScrapedPost:
    shortcode: str
    source_handle: str
    post_url: str
    media_url: str | None
    caption: str
    posted_at_iso: str


class InstagramScraper:
    def __init__(
        self,
        session_file: str | None = None,
        login_username: str | None = None,
        login_password: str | None = None,
    ) -> None:
        self.loader = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            save_metadata=False,
            compress_json=False,
            quiet=True,
        )

        if session_file:
            try:
                self.loader.load_session_from_file(login_username or "", session_file)
                LOGGER.info("Loaded Instaloader session from %s", session_file)
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("Could not load Instaloader session %s: %s", session_file, exc)

        if login_username and login_password:
            try:
                self.loader.login(login_username, login_password)
                LOGGER.info("Logged into Instaloader as %s", login_username)
                if session_file:
                    self.loader.save_session_to_file(session_file)
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("Instaloader login failed: %s", exc)

    @staticmethod
    def _first_image_url(post: instaloader.Post) -> str | None:
        if post.typename == "GraphSidecar":
            for node in post.get_sidecar_nodes():
                if not node.is_video:
                    return node.display_url
            return None

        if post.is_video:
            return post.url

        return post.url

    def fetch_recent_posts(self, handle: str, max_posts: int) -> list[ScrapedPost]:
        profile = instaloader.Profile.from_username(self.loader.context, handle)
        posts: list[ScrapedPost] = []

        for index, post in enumerate(profile.get_posts()):
            if index >= max_posts:
                break
            media_url = self._first_image_url(post)
            if not media_url:
                continue

            posted_at = post.date_utc
            if posted_at.tzinfo is None:
                posted_at = posted_at.replace(tzinfo=timezone.utc)
            post_time = posted_at.astimezone(timezone.utc).isoformat()

            posts.append(
                ScrapedPost(
                    shortcode=post.shortcode,
                    source_handle=handle,
                    post_url=f"https://www.instagram.com/p/{post.shortcode}/",
                    media_url=media_url,
                    caption=post.caption or "",
                    posted_at_iso=post_time,
                )
            )

        LOGGER.info("Fetched %s posts for @%s", len(posts), handle)
        return posts
