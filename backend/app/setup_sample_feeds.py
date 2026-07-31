"""
setup_sample_feeds.py
----------------------
Populates app/sample_feeds/ with test images for CAM_JUBILEE, CAM_SECUNDERABAD,
and CAM_ABIDS: accident.jpg, fire.jpg, flood.jpg, crowd.jpg.

Everything comes from the Pexels API — no giant Kaggle dataset downloads,
so it's fast and won't drop mid-transfer on a flaky connection.

SETUP (one-time):
    pip install pillow requests

    Pexels API key (free, instant, no waiting):
       - Go to https://www.pexels.com/api/ -> sign up -> copy your API key
       - Set it as an environment variable:
         Windows (PowerShell): $env:PEXELS_API_KEY="your_key_here"
         Mac/Linux:            export PEXELS_API_KEY="your_key_here"

USAGE:
    python setup_sample_feeds.py

OUTPUT:
    app/sample_feeds/CAM_JUBILEE/accident.jpg
    app/sample_feeds/CAM_SECUNDERABAD/flood.jpg
    app/sample_feeds/CAM_ABIDS/crowd.jpg
    app/sample_feeds/_extra/fire.jpg
    (adjust CAMERA_MAP below if your camera-to-hazard pairing differs)
"""

import os
import random
import time
from pathlib import Path

import requests
from PIL import Image

# ---- CONFIG ---------------------------------------------------------------

OUTPUT_ROOT = Path("app/sample_feeds")

# Which camera gets which hazard sample. Edit to match your demo script.
CAMERA_MAP = {
    "CAM_JUBILEE": "accident",
    "CAM_SECUNDERABAD": "flood",
    "CAM_ABIDS": "crowd",
}
EXTRA_FILES = ["fire"]  # saved to app/sample_feeds/_extra/, not tied to a camera

TARGET_SIZE = (640, 480)  # resize everything to a consistent frame size

PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")
PEXELS_QUERIES = {
    "accident": "car crash road accident",
    "flood": "flooded street india",
    "crowd": "crowded railway platform india",
    "fire": "building fire smoke",
}

# ---- HELPERS ---------------------------------------------------------------


def resize_and_save(src_path: Path, dst_path: Path):
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src_path) as img:
        img = img.convert("RGB")
        img = img.resize(TARGET_SIZE)
        img.save(dst_path, "JPEG", quality=85)
    print(f"  -> saved {dst_path}")


def fetch_from_pexels(query: str, out_path: Path, retries: int = 3):
    if not PEXELS_API_KEY:
        print(f"  ! PEXELS_API_KEY not set, skipping '{query}'. "
              f"Get one free at https://www.pexels.com/api/")
        return False

    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(
                "https://api.pexels.com/v1/search",
                headers={"Authorization": PEXELS_API_KEY},
                params={"query": query, "per_page": 5},
                timeout=15,
            )
            resp.raise_for_status()
            photos = resp.json().get("photos", [])
            if not photos:
                print(f"  ! No Pexels results for '{query}'")
                return False

            photo = random.choice(photos)
            img_url = photo["src"]["large"]
            img_resp = requests.get(img_url, timeout=20)
            img_resp.raise_for_status()

            tmp_path = out_path.with_suffix(".tmp.jpg")
            tmp_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path.write_bytes(img_resp.content)
            resize_and_save(tmp_path, out_path)
            tmp_path.unlink()
            return True

        except (requests.exceptions.RequestException, OSError) as e:
            print(f"  ! Attempt {attempt}/{retries} failed for '{query}': {e}")
            if attempt < retries:
                time.sleep(2 * attempt)
            else:
                return False


# ---- MAIN -------------------------------------------------------------


def main():
    print("Setting up Sentinel AI sample_feeds/ ...\n")

    for camera_id, hazard in CAMERA_MAP.items():
        out_path = OUTPUT_ROOT / camera_id / f"{hazard}.jpg"
        print(f"[{camera_id}] -> {hazard}.jpg")

        query = PEXELS_QUERIES.get(hazard)
        ok = fetch_from_pexels(query, out_path) if query else False

        if not query:
            print(f"  ! No query configured for hazard type '{hazard}', skipping.")
        if not ok:
            print(f"  ! Failed to populate {out_path}. "
                  f"Drop an image there manually as a fallback.\n")
        else:
            print()

    for hazard in EXTRA_FILES:
        out_path = OUTPUT_ROOT / "_extra" / f"{hazard}.jpg"
        print(f"[extra] -> {hazard}.jpg")
        query = PEXELS_QUERIES.get(hazard)
        ok = fetch_from_pexels(query, out_path) if query else False
        if not ok:
            print(f"  ! Failed to populate {out_path}.\n")
        else:
            print()

    print("Done. Review app/sample_feeds/ and swap in better frames if needed.")


if __name__ == "__main__":
    main()