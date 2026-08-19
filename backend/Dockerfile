FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads /app/data

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Single worker. Routes are sync `def`, so FastAPI already runs them in a
# threadpool — /health stays responsive during a slow upload without a
# second worker process. That matters here because SQLite is single-writer:
# a second worker races the first on table creation at startup (both call
# create_all against the same file) and crashes with "table already exists".
# If you move to Postgres and want more concurrency, --workers 2+ is fine.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
