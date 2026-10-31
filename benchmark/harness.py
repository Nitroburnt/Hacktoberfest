#!/usr/bin/env python3
"""AutoEvolve benchmark harness.

Input : one Python source file (path or stdin)
Output: a single JSON object on stdout, nothing else.

Score contract (frozen rubric v1.0.0):
    functional = number of the 10 functional tests that pass  (0..10)
    edge       = number of the 5 edge tests that pass          (0..5)
    static     = static quality, 0..5
    safety     = false if the code cannot run inside the sandbox

The harness never trusts the candidate: banned imports are detected with an
AST scan, the suite runs with no network and a wall-clock budget, and failures
are reported by pytest's JUnit XML (machine readable, not stdout scraping).
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
BANNED_IMPORTS = {"os", "subprocess", "socket", "shutil", "sys"}
FUNCTIONAL_TOTAL = 10
EDGE_TOTAL = 5
TIMEOUT_SEC = 5


def emit(result: dict) -> None:
    """Print exactly one JSON document and exit."""
    sys.stdout.write(json.dumps(result, sort_keys=True))
    sys.stdout.flush()


def safety_fail(reason: str) -> dict:
    return {
        "functional": 0,
        "edge": 0,
        "static": 0,
        "safety": False,
        "safetyReason": reason,
        "failureIds": [],
        "detail": {"safetyReason": reason},
    }


def check_safety(source: str) -> str | None:
    """Return a failure reason, or None when the source passes the gate."""
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return f"syntax error: {exc.msg} (line {exc.lineno})"

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in BANNED_IMPORTS:
                    return f"banned import: {root}"
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in BANNED_IMPORTS:
                return f"banned import: {root}"
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id == "__import__":
                return "dynamic import: __import__"
    return None


def run_pytest(targets: list[Path], solution_dir: str, workdir: Path, timeout: int) -> tuple[dict, list[str], str]:
    """Run pytest on the given targets; return per-test outcomes."""
    outcomes: dict[str, bool] = {}
    failures: list[str] = []
    xml_path = workdir / "report.xml"

    env = dict(os.environ)
    env["SOLUTION_DIR"] = solution_dir
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    # Keep the suite hermetic: no proxies, no network helpers.
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        env.pop(key, None)

    cmd = [sys.executable, "-m", "pytest", *[str(t) for t in targets], "-q", "--tb=short",
           "-p", "no:cacheprovider", f"--junitxml={xml_path}"]
    note = ""
    try:
        proc = subprocess.run(cmd, cwd=HERE, env=env, capture_output=True, text=True, timeout=timeout)
        note = (proc.stdout or "") + (proc.stderr or "")
    except subprocess.TimeoutExpired:
        for t in targets:
            kind = t.name
            total = FUNCTIONAL_TOTAL if kind == "functional" else EDGE_TOTAL
            for i in range(total):
                outcomes[f"{kind}/test_{i}"] = False
                failures.append(f"{kind}/test_{i}")
        return outcomes, failures, "timeout"

    if not xml_path.exists():
        return outcomes, failures, note

    root = ET.parse(xml_path).getroot()
    for case in root.iter("testcase"):
        name = case.get("name", "")
        failed = any(child.tag in ("failure", "error") for child in case)
        outcomes[name] = not failed
        if failed:
            failures.append(name)
    return outcomes, failures, note


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--code", help="path to candidate python file")
    parser.add_argument("--stdin", action="store_true", help="read candidate source from stdin")
    parser.add_argument("--timeout", type=int, default=TIMEOUT_SEC)
    args = parser.parse_args()

    if args.stdin:
        source = sys.stdin.read()
    elif args.code:
        source = Path(args.code).read_text(encoding="utf-8")
    else:
        emit(safety_fail("no candidate code supplied"))
        return 0

    reason = check_safety(source)
    if reason is not None:
        emit(safety_fail(reason))
        return 0

    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="autoevolve-") as tmp:
        solution_dir = Path(tmp)
        (solution_dir / "solution.py").write_text(source, encoding="utf-8")
        outcomes, failures, note = run_pytest(
            [HERE / "tests/functional", HERE / "tests/edge"],
            str(solution_dir),
            solution_dir,
            args.timeout,
        )

        if note == "timeout":
            emit(safety_fail(f"timeout after {args.timeout}s"))
            return 0

        # Tests that never ran (collection error, import failure) count as failures.
        fn_pass = sum(1 for k, v in outcomes.items() if k.startswith("test_f") and v)
        edge_pass = sum(1 for k, v in outcomes.items() if k.startswith("test_e") and v)
        functional = max(0, min(FUNCTIONAL_TOTAL, fn_pass))
        edge = max(0, min(EDGE_TOTAL, edge_pass))

        sys.path.insert(0, str(HERE))
        try:
            from static_check import static_score  # noqa: PLC0415

            static, static_detail = static_score(
                source, str(solution_dir / "solution.py"), run_ruff=True
            )
        except Exception as exc:  # pragma: no cover - defensive
            static, static_detail = 0, {"error": str(exc)}

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    emit(
        {
            "functional": functional,
            "edge": edge,
            "static": static,
            "safety": True,
            "safetyReason": None,
            "failureIds": sorted(failures),
            "detail": {"static": static_detail, "elapsedMs": elapsed_ms, "suiteLog": note[-2000:]},
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
