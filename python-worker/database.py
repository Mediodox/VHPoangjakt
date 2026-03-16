import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import requests


LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class ClassRow:
    id: str
    name: str
    instagram_handle: str


@dataclass(frozen=True)
class ChallengeMapping:
    challenge_id: str
    challenge_number: int
    points: int
    title: str


class SupabaseDB:
    def __init__(self, base_url: str, service_role_key: str, timeout_seconds: int) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json",
            }
        )

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        response = self.session.request(
            method=method,
            url=f"{self.base_url}{path}",
            timeout=self.timeout_seconds,
            **kwargs,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"Supabase request failed ({response.status_code}) {method} {path}: {response.text}"
            )
        return response

    def get_active_classes(self) -> list[ClassRow]:
        params = urlencode(
            {
                "select": "id,name,instagram_handle",
                "active": "eq.true",
                "order": "name.asc",
            }
        )
        response = self._request("GET", f"/rest/v1/classes?{params}")
        data = response.json()
        return [
            ClassRow(
                id=item["id"],
                name=item["name"],
                instagram_handle=item["instagram_handle"],
            )
            for item in data
        ]

    def get_challenge_map(self) -> dict[int, ChallengeMapping]:
        params = urlencode(
            {
                "select": "id,title,default_points,challenge_number",
                "active": "eq.true",
                "challenge_number": "not.is.null",
                "order": "challenge_number.asc",
            }
        )
        response = self._request("GET", f"/rest/v1/challenges?{params}")
        data = response.json()
        mapping: dict[int, ChallengeMapping] = {}
        for item in data:
            number = int(item["challenge_number"])
            mapping[number] = ChallengeMapping(
                challenge_id=item["id"],
                challenge_number=number,
                points=int(item["default_points"]),
                title=item["title"],
            )
        return mapping

    def is_post_processed(self, fingerprint: str) -> bool:
        params = urlencode(
            {
                "select": "id",
                "fingerprint": f"eq.{fingerprint}",
                "limit": "1",
            }
        )
        response = self._request("GET", f"/rest/v1/instagram_posts_raw?{params}")
        data = response.json()
        return len(data) > 0

    def insert_raw_post(
        self,
        source_handle: str,
        post_url: str,
        media_url: str | None,
        caption: str,
        posted_at_iso: str,
        fingerprint: str,
        payload: dict[str, Any],
        ingest_error: str | None = None,
    ) -> str:
        record = {
            "source_handle": source_handle,
            "post_url": post_url,
            "media_url": media_url,
            "caption": caption,
            "posted_at": posted_at_iso,
            "fingerprint": fingerprint,
            "payload": payload,
            "ingest_error": ingest_error,
        }
        headers = {"Prefer": "return=representation"}
        response = self._request(
            "POST",
            "/rest/v1/instagram_posts_raw",
            json=[record],
            headers=headers,
        )
        rows = response.json()
        if not rows:
            raise RuntimeError("insert_raw_post returned no rows")
        return rows[0]["id"]

    def insert_point_event(
        self,
        class_id: str,
        challenge_id: str,
        points: int,
        reason: str,
        source_post_id: str,
    ) -> None:
        event = {
            "class_id": class_id,
            "challenge_id": challenge_id,
            "points": points,
            "reason": reason,
            "source_post_id": source_post_id,
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }
        self._request("POST", "/rest/v1/point_events", json=[event])
        LOGGER.info("Inserted point_event class_id=%s points=%s", class_id, points)
