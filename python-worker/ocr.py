import logging
import re
from dataclasses import dataclass

import cv2
import numpy as np
import pytesseract


LOGGER = logging.getLogger(__name__)

CHALLENGE_PATTERNS = [
    re.compile(r"challenge\s*#?\s*(\d{1,3})", re.IGNORECASE),
    re.compile(r"\b#?\s*(\d{1,3})\b"),
]


@dataclass(frozen=True)
class OCRResult:
    challenge_number: int | None
    points_value: int | None
    extracted_text: str


class ChallengeOCR:
    def __init__(self, tesseract_cmd: str | None = None) -> None:
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    @staticmethod
    def _preprocess_variants(image_path: str) -> list[np.ndarray]:
        image = cv2.imread(image_path)
        if image is None:
            raise RuntimeError(f"Could not read image: {image_path}")

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        denoised = cv2.bilateralFilter(gray, 9, 75, 75)

        adaptive = cv2.adaptiveThreshold(
            denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 35, 5
        )
        _, otsu = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        kernel = np.ones((2, 2), np.uint8)
        morph = cv2.morphologyEx(adaptive, cv2.MORPH_CLOSE, kernel)
        return [gray, adaptive, otsu, morph]

    @staticmethod
    def _extract_challenge_number(text: str) -> int | None:
        normalized = text.replace("\n", " ")
        for pattern in CHALLENGE_PATTERNS:
            for match in pattern.finditer(normalized):
                number = int(match.group(1))
                if 0 < number <= 999:
                    return number
        return None

    @staticmethod
    def _extract_points_value(text: str) -> int | None:
        normalized = text.replace("\n", " ")
        points_patterns = [
            re.compile(r"(?:points?|po[aä]ng|pts?)\s*[:=#-]?\s*\+?(\d{1,4})", re.IGNORECASE),
            re.compile(r"\+(\d{1,4})\s*(?:points?|po[aä]ng|pts?|p)\b", re.IGNORECASE),
            re.compile(r"(\d{1,4})\s*(?:points?|po[aä]ng|pts?)\b", re.IGNORECASE),
        ]
        for pattern in points_patterns:
            for match in pattern.finditer(normalized):
                value = int(match.group(1))
                if 0 < value <= 5000:
                    return value
        return None

    def detect_fields(self, image_path: str) -> OCRResult:
        variants = self._preprocess_variants(image_path)
        all_text: list[str] = []
        for variant in variants:
            extracted = pytesseract.image_to_string(variant, config="--oem 3 --psm 6")
            if extracted:
                all_text.append(extracted)

        merged_text = "\n".join(all_text).strip()
        challenge_number = self._extract_challenge_number(merged_text)
        points_value = self._extract_points_value(merged_text)
        LOGGER.info("OCR detected challenge=%s points=%s", challenge_number, points_value)
        return OCRResult(
            challenge_number=challenge_number,
            points_value=points_value,
            extracted_text=merged_text,
        )
