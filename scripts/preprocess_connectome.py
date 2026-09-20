"""Bounded, deterministic extraction from the real MaleCNS v1.0 graph.

The source is streamed one Arrow record batch at a time. No fabricated edges,
cross-connectome IDs, anatomical coordinates, or physiological signs are added.
"""
from __future__ import annotations

import argparse
import heapq
import json
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.feather as feather
import pyarrow.ipc as ipc

from download_connectome import FILES, RAW, ROOT, sha256

OUT = ROOT / "web/public/data"
INPUT_TYPES = ("LC4", "LPLC2", "LC10a", "LC16")
OUTPUT_TYPES = ("DNp01", "DNa02", "DNp09", "MDN")
CONFIG = {"version": 1, "minSynapses": 5, "backwardSteps": 3, "incomingPerStep": 32, "maxNeurons": 5000, "incomingPerTarget": 64}
EXAMPLES = {12032: "LC4", 16128: "LC4", 11498: "LPLC2", 14465: "LPLC2", 10573: "LC10a", 21065: "LC10a", 20297: "LC16", 36432: "LC16", 10010: "DNp01", 10001: "DNp01", 523769: "DNa02", 10360: "DNa02", 10783: "DNp09", 11177: "DNp09", 10763: "MDN", 11288: "MDN", 11332: "MDN", 12348: "MDN"}


def membership(values: np.ndarray, sorted_ids: np.ndarray) -> np.ndarray:
    positions = np.searchsorted(sorted_ids, values)
    return (positions < len(sorted_ids)) & (sorted_ids[np.minimum(positions, len(sorted_ids) - 1)] == values)


def top_incoming(path: Path, targets: set[int], valid_ids: np.ndarray, limit: int) -> dict[int, list[tuple[int, int]]]:
    target_ids = np.array(sorted(targets), dtype=np.int64)
    heaps: dict[int, list] = defaultdict(list)
    with pa.memory_map(str(path), "r") as stream:
        reader = ipc.open_file(stream)
        required = {"body_pre", "body_post", "weight"}
        if not required.issubset(reader.schema.names):
            raise ValueError(f"Unexpected connectivity schema: {reader.schema}")
        for number in range(reader.num_record_batches):
            batch = reader.get_batch(number)
            pre = batch.column("body_pre").to_numpy()
            post = batch.column("body_post").to_numpy()
            weights = batch.column("weight").to_numpy()
            mask = (weights >= CONFIG["minSynapses"]) & membership(post, target_ids)
            sources, destinations, counts = pre[mask], post[mask], weights[mask]
            valid = membership(sources, valid_ids)
            for source, target, count in zip(sources[valid].tolist(), destinations[valid].tolist(), counts[valid].tolist()):
                # At equal count, prefer the smaller original neuron ID.
                candidate = (count, -source)
                heap = heaps[target]
                if len(heap) < limit:
                    heapq.heappush(heap, candidate)
                elif candidate > heap[0]:
                    heapq.heapreplace(heap, candidate)
            if number % 500 == 0:
                print(f"  Scanned batch {number + 1}/{reader.num_record_batches}", flush=True)
    return {target: [(int(-source), int(count)) for count, source in sorted(heap, reverse=True)] for target, heap in heaps.items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    started = time.monotonic()
    OUT.mkdir(parents=True, exist_ok=True)
    receipts = []
    for filename in FILES:
        path = RAW / filename
        receipt_path = path.with_suffix(path.suffix + ".source.json")
        if not path.exists() or not receipt_path.exists():
            raise FileNotFoundError(f"Missing {filename}. Run npm run setup first.")
        receipt = json.loads(receipt_path.read_text())
        if path.stat().st_size != receipt["bytes"] or sha256(path) != receipt["sha256"]:
            raise ValueError(f"Corrupt cached source: {filename}. Remove this file and its receipt, then rerun setup.")
        receipts.append(receipt)
    manifest_path = OUT / "manifest.json"
    if manifest_path.exists() and not args.force:
        old = json.loads(manifest_path.read_text())
        valid = old.get("extraction") == CONFIG and old.get("sources") == receipts
        valid = valid and all((OUT / filename).exists() and sha256(OUT / filename) == info["sha256"] for filename, info in old.get("files", {}).items())
        if valid:
            print("Prepared graph is current; reusing verified cache.", flush=True)
            return

    annotations = feather.read_table(RAW / FILES[0])
    if not {"bodyId", "type", "status", "somaSide"}.issubset(annotations.column_names):
        raise ValueError("Annotation schema changed; refusing to guess")
    neurons = {row["bodyId"]: row for row in annotations.to_pylist() if row["status"] == "Traced"}
    for body_id, expected_type in EXAMPLES.items():
        if neurons.get(body_id, {}).get("type") != expected_type:
            raise ValueError(f"Expected neuron {body_id} of type {expected_type} was not verified")
    inputs = {body_id for body_id, row in neurons.items() if row["type"] in INPUT_TYPES}
    outputs = {body_id for body_id, row in neurons.items() if row["type"] in OUTPUT_TYPES}
    for cell_type in INPUT_TYPES + OUTPUT_TYPES:
        if not any(row["type"] == cell_type for row in neurons.values()):
            raise ValueError(f"Missing required population {cell_type}")
    selected = inputs | outputs
    valid_ids = np.array(sorted(neurons), dtype=np.int64)
    frontier = set(outputs)
    for depth in range(CONFIG["backwardSteps"]):
        if not frontier or len(selected) >= CONFIG["maxNeurons"]:
            break
        print(f"Backward step {depth + 1}: {len(frontier)} targets", flush=True)
        incoming = top_incoming(RAW / FILES[1], frontier, valid_ids, CONFIG["incomingPerStep"])
        priorities = defaultdict(int)
        for edges in incoming.values():
            for source, weight in edges:
                if source not in selected:
                    priorities[source] += weight
        candidates = sorted(priorities, key=lambda body_id: (-priorities[body_id], body_id))
        frontier = set(candidates[:CONFIG["maxNeurons"] - len(selected)])
        selected.update(frontier)
        print(f"  Selected {len(selected)} neurons", flush=True)

    print("Extracting real connections between selected neurons", flush=True)
    ids = np.array(sorted(selected), dtype=np.int64)
    incoming = top_incoming(RAW / FILES[1], selected, ids, CONFIG["incomingPerTarget"])
    index = {int(body_id): i for i, body_id in enumerate(ids)}
    edges = [(index[source], index[target], count) for target in sorted(incoming) for source, count in incoming[target]]
    sources = np.array([edge[0] for edge in edges], dtype="<u4")
    targets = np.array([edge[1] for edge in edges], dtype="<u4")
    counts = np.array([edge[2] for edge in edges], dtype="<u4")
    if not len(edges):
        raise ValueError("No real connections were retained")
    totals = np.bincount(targets, weights=counts, minlength=len(ids))
    weights = (counts / totals[targets]).astype("<f4")

    nt_table = feather.read_table(RAW / FILES[2], columns=["body", "consensus_nt"])
    nt_ids = nt_table.column("body").to_numpy()
    nt_rows = nt_table.filter(pa.array(membership(nt_ids, ids))).to_pylist()
    nt = {row["body"]: row["consensus_nt"] for row in nt_rows}
    metadata = []
    populations = defaultdict(list)
    for i, body_id in enumerate(ids.tolist()):
        row = neurons[body_id]
        side = row.get("somaSide") or row.get("rootSide")
        role = "input" if body_id in inputs else "output" if body_id in outputs else "intermediate"
        metadata.append({"id": str(body_id), "type": row.get("type") or "untyped", "instance": row.get("instance"), "side": side, "role": role, "neurotransmitter": nt.get(body_id)})
        if role in ("input", "output"):
            populations[row["type"]].append(i)
            if side in ("L", "R"):
                populations[f"{row['type']}_{side}"].append(i)

    adjacency = defaultdict(list)
    for source, target, _ in edges:
        adjacency[source].append(target)
    reachability = {}
    for cell_type in INPUT_TYPES:
        seen = set(populations[cell_type])
        queue = deque(sorted(seen))
        while queue:
            for target in adjacency[queue.popleft()]:
                if target not in seen:
                    seen.add(target)
                    queue.append(target)
        reachability[cell_type] = {output: sum(i in seen for i in populations[output]) for output in OUTPUT_TYPES}
    if not any(reachability[cell_type]["DNp01"] for cell_type in ("LC4", "LPLC2")):
        raise ValueError("Extraction failed: no looming-to-giant-fiber path. No substitute graph will be generated.")
    files = {}
    for filename, array in (("sources.u32", sources), ("targets.u32", targets), ("counts.u32", counts), ("weights.f32", weights)):
        array.tofile(OUT / filename)
        files[filename] = {"bytes": (OUT / filename).stat().st_size, "sha256": sha256(OUT / filename)}
    (OUT / "neurons.json").write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")
    files["neurons.json"] = {"bytes": (OUT / "neurons.json").stat().st_size, "sha256": sha256(OUT / "neurons.json")}
    manifest = {
        "schemaVersion": 1, "dataset": "male-cns:v1.0", "license": "CC-BY-4.0",
        "sourcePage": "https://male-cns.janelia.org/download/", "generatedAt": datetime.now(timezone.utc).isoformat(),
        "neuronCount": len(ids), "edgeCount": len(edges), "synapseCount": int(counts.sum()),
        "tracedSourceNeurons": len(neurons), "extraction": CONFIG, "sources": receipts, "files": files,
        "populations": dict(populations), "reachability": reachability,
        "calibration": None, "preparationSeconds": round(time.monotonic() - started, 2),
        "assumptions": ["Nonnegative activity propagation, not electrophysiology", "Weights normalized over retained incoming connections", "Soma-side stimulus grouping approximates visual laterality", "Descending activity is interpreted by a cartoon behavior decoder", "Layout is schematic, not anatomical"],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(ids):,} real neurons, {len(edges):,} edges, {int(counts.sum()):,} retained synapses in {manifest['preparationSeconds']}s", flush=True)
    print("Reachability: " + json.dumps(reachability), flush=True)


if __name__ == "__main__":
    main()
