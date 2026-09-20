"""Public, resumable MaleCNS downloads. No credentials or neuPrint required."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
BASE = "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/"
FILES = (
    "body-annotations-male-cns-v1.0-minconf-0.5.feather",
    "connectome-weights-male-cns-v1.0-minconf-0.5.feather",
    "body-neurotransmitters-male-cns-v1.0.feather",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, path: Path) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    receipt = path.with_suffix(path.suffix + ".source.json")
    if path.exists() and receipt.exists():
        metadata = json.loads(receipt.read_text())
        if metadata.get("url") == url and path.stat().st_size == metadata.get("bytes") and sha256(path) == metadata.get("sha256"):
            print(f"Cached and verified: {path.name}", flush=True)
            return metadata

    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as response:
                size = int(response.headers["Content-Length"])
                etag = response.headers.get("ETag")
            # Reuse the original research download only after checking remote size.
            existing = ROOT / "research" / path.name
            if not path.exists() and existing.exists() and existing.stat().st_size == size:
                shutil.copyfile(existing, path)
            if not path.exists() or path.stat().st_size != size:
                partial = path.with_suffix(path.suffix + ".part")
                offset = partial.stat().st_size if partial.exists() else 0
                if offset > size:
                    offset = 0
                headers = {"Range": f"bytes={offset}-"} if offset else {}
                if etag and offset:
                    headers["If-Range"] = etag
                with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as response:
                    if offset and response.status != 206:
                        offset = 0
                    elif offset and not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-"):
                        raise RuntimeError("Server returned an unexpected resume range")
                    mode = "ab" if offset else "wb"
                    last_report = 0.0
                    with partial.open(mode) as stream:
                        while chunk := response.read(2 * 1024 * 1024):
                            stream.write(chunk)
                            offset += len(chunk)
                            if time.monotonic() - last_report > 5:
                                print(f"{path.name}: {offset / size:.0%} ({offset / 1e6:.1f}/{size / 1e6:.1f} MB)", flush=True)
                                last_report = time.monotonic()
                if partial.stat().st_size != size:
                    raise RuntimeError("Incomplete download; rerun to resume")
                partial.replace(path)
            metadata = {"url": url, "bytes": size, "etag": etag, "sha256": sha256(path), "downloadedAt": datetime.now(timezone.utc).isoformat()}
            receipt.write_text(json.dumps(metadata, indent=2) + "\n")
            print(f"Verified: {path.name} ({size / 1e6:.1f} MB)", flush=True)
            return metadata
        except Exception as error:
            last_error = error
            print(f"Download attempt {attempt + 1}/3 failed: {error}", flush=True)
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Could not download {url}. Partial data is retained; rerun setup to resume.") from last_error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models-only", action="store_true")
    args = parser.parse_args()
    if not args.models_only:
        for filename in FILES:
            download(BASE + filename, RAW / filename)
    download("https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", ROOT / "web/public/models/hand_landmarker.task")


if __name__ == "__main__":
    main()
