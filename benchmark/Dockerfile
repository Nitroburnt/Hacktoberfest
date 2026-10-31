# AutoEvolve benchmark sandbox.
# No network at runtime (run.ts passes --network none), no shell tooling beyond
# what pytest/ruff need, fixed interpreter version for deterministic scoring.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY harness.py static_check.py /app/
COPY tests /app/tests

ENTRYPOINT ["python", "/app/harness.py"]
