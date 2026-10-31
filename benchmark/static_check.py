"""Deterministic static-quality scoring (0..5).

Five independent signals, one point each. Every signal is computable from the
source text and the pinned ruff version, so the same file always scores the
same. This is the only part of the rubric that has any style opinion, and it is
capped at 5/100 of the total on purpose.
"""

from __future__ import annotations

import ast
import json
import subprocess
import sys
from pathlib import Path


def _ruff_issues(path: str) -> list[dict] | None:
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "ruff", "check", path, "--output-format=json",
             "--select", "E,F", "--no-cache"],
            capture_output=True,
            text=True,
            timeout=20,
        )
        if not proc.stdout.strip():
            return []
        return json.loads(proc.stdout)
    except Exception:
        return None


def static_score(source: str, path: str, run_ruff: bool = True) -> tuple[int, dict]:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return 0, {"reason": "syntax error"}

    signals: dict[str, bool] = {}

    # 1. Lint clean (E/F rules only) under the pinned ruff version.
    if run_ruff:
        issues = _ruff_issues(path)
        signals["lint_clean"] = issues is not None and len(issues) == 0
    else:  # pragma: no cover
        signals["lint_clean"] = False

    # 2. Documented: module or public function docstring.
    signals["documented"] = any(
        isinstance(node, (ast.Module, ast.FunctionDef)) and ast.get_docstring(node)
        for node in ast.walk(tree)
    )

    # 3. No bare `except:` swallowing everything.
    signals["no_bare_except"] = not any(
        isinstance(node, ast.ExceptHandler) and node.type is None for node in ast.walk(tree)
    )

    # 4. Explicit input hygiene: strips whitespace or warns on skipped rows.
    signals["input_hygiene"] = any(
        isinstance(node, ast.Attribute) and node.attr == "strip" for node in ast.walk(tree)
    ) or any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "warn"
        for node in ast.walk(tree)
    )

    # 5. Typed public interface.
    signals["typed"] = any(
        isinstance(node, ast.FunctionDef)
        and (node.returns is not None or any(a.annotation is not None for a in node.args.args))
        for node in ast.walk(tree)
    )

    score = sum(1 for ok in signals.values() if ok)
    return int(score), {"signals": signals}
