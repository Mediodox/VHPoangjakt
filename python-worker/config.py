import logging
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def _to_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


@dataclass(frozen=True)
class WorkerSettings:
    supabase_url: str
    supabase_service_role_key: str
    check_interval_seconds: int
    max_posts_per_account: int
    request_timeout_seconds: int
    delay_between_accounts_seconds: float
    delay_between_posts_seconds: float
    tmp_dir: Path
    dry_run: bool
    run_once: bool
    log_level: str
    tesseract_cmd: str | None
    instaloader_session_file: Path | None
    instaloader_login_username: str | None
    instaloader_login_password: str | None


def load_settings() -> WorkerSettings:
    root_dir = Path(__file__).resolve().parents[1]
    load_dotenv(root_dir / ".env.local", override=False)
    load_dotenv()

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url:
        raise ValueError("Missing NEXT_PUBLIC_SUPABASE_URL")
    if not supabase_service_role_key:
        raise ValueError("Missing SUPABASE_SERVICE_ROLE_KEY")

    tmp_dir = Path(os.getenv("PY_WORKER_TMP_DIR", "python-worker/tmp")).resolve()
    session_file_value = os.getenv("INSTALOADER_SESSION_FILE", "").strip()
    session_file = Path(session_file_value).resolve() if session_file_value else None

    return WorkerSettings(
        supabase_url=supabase_url,
        supabase_service_role_key=supabase_service_role_key,
        check_interval_seconds=max(60, int(os.getenv("PY_WORKER_CHECK_INTERVAL_SECONDS", "600"))),
        max_posts_per_account=max(1, int(os.getenv("PY_WORKER_MAX_POSTS_PER_ACCOUNT", "8"))),
        request_timeout_seconds=max(5, int(os.getenv("PY_WORKER_REQUEST_TIMEOUT_SECONDS", "30"))),
        delay_between_accounts_seconds=max(
            0.0, float(os.getenv("PY_WORKER_DELAY_BETWEEN_ACCOUNTS_SECONDS", "3.0"))
        ),
        delay_between_posts_seconds=max(
            0.0, float(os.getenv("PY_WORKER_DELAY_BETWEEN_POSTS_SECONDS", "1.0"))
        ),
        tmp_dir=tmp_dir,
        dry_run=_to_bool(os.getenv("PY_WORKER_DRY_RUN"), default=False),
        run_once=_to_bool(os.getenv("PY_WORKER_RUN_ONCE"), default=False),
        log_level=os.getenv("PY_WORKER_LOG_LEVEL", "INFO").upper(),
        tesseract_cmd=os.getenv("TESSERACT_CMD"),
        instaloader_session_file=session_file,
        instaloader_login_username=os.getenv("INSTALOADER_LOGIN_USERNAME"),
        instaloader_login_password=os.getenv("INSTALOADER_LOGIN_PASSWORD"),
    )


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
