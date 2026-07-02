# Ceremony — one image serving both the agent (/api) and the PWA (static).
# The vault lives on a mounted volume (CEREMONY_VAULT=/data/vault) and syncs
# to its private remote via CEREMONY_VAULT_REMOTE.

# --- stage 1: build the capture client ---
FROM node:22-slim AS pwa
WORKDIR /build
COPY ceremony/package*.json ./
RUN npm ci --ignore-scripts
COPY ceremony/ ./
RUN npm run build

# --- stage 2: the agent ---
FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY agent/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY agent/ ./
COPY --from=pwa /build/dist ./static

ENV CEREMONY_VAULT=/data/vault
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
