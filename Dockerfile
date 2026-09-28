# Stage 1: Build Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend & Runtime
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    SENTINEL_DATABASE_URL=sqlite+pysqlite:////app/data/banking.sqlite3 \
    SKIP_DOTENV=1 \
    RPA_HEADLESS=true

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install --with-deps chromium

COPY . .
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
RUN mkdir -p /app/data /app/sessions /app/static

EXPOSE 8080

CMD ["python", "dev_ui.py"]

