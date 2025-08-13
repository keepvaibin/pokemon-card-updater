# Pokémon Card Updater — Local Functions, Docker & Systemd

This repository runs a set of **local Azure Functions–style** workers that fetch Pokémon TCG card pages and write to two databases:
- **Main app DB** (PostgreSQL) — cards, sets, images, etc.
- **TimescaleDB** — price history (“PriceHistory” hypertable)

You can run it in three ways:
1. **Locally** using Azure Functions Core Tools (no containers)
2. **Docker Compose** (app + Azurite in containers)
3. **systemd** services so it starts on boot (either **Core Tools** mode or **Docker Compose** mode)

> This README includes everything you need: env setup, Prisma client generation (two schemas), timeouts, queues, Docker/Compose, and systemd units.

---

## Contents
- [Prerequisites](#prerequisites)
- [Environment (.env)](#environment-env)
- [Prisma clients (two schemas)](#prisma-clients-two-schemas)
- [Local run (Core Tools)](#local-run-core-tools)
- [Docker: single container](#docker-single-container)
- [Docker Compose: app + Azurite](#docker-compose-app--azurite)
- [systemd: run Core Tools at boot](#systemd-run-core-tools-at-boot)
- [systemd: run Docker Compose at boot](#systemd-run-docker-compose-at-boot)
- [Timeouts & concurrency quick guide](#timeouts--concurrency-quick-guide)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### If running **without Docker**
- Node.js **20+** (LTS recommended)
- npm **9+**
- Azure Functions Core Tools v4
- PostgreSQL + TimescaleDB
- Azurite (local Azure Storage emulator) *or* a real Azure Storage account

### If running **with Docker/Compose**
- Docker Engine (Linux) or Docker Desktop (Mac/Windows)
- Docker Compose v2

---

## Environment (.env)

All secrets live in `.env`. Example:

```env
# --- Postgres / Timescale URLs (limit 1 conn per worker, wait longer for bursts)
DATABASE_URL="postgresql://USER:PASS@HOST:5432/card_db?sslmode=require&connection_limit=1&pool_timeout=300"
TIMESCALE_URL="postgresql://USER:PASS@HOST:5432/price_tracking?sslmode=require&connection_limit=1&pool_timeout=300"

# --- Pokémon TCG API keys (one per worker ideal)
X_API_KEY_1=your-key-1
X_API_KEY_2=your-key-2
X_API_KEY_3=your-key-3
X_API_KEY_4=your-key-4
X_API_KEY_5=your-key-5
X_API_KEY_6=your-key-6
X_API_KEY_7=your-key-7
X_API_KEY_8=your-key-8
X_API_KEY_9=your-key-9

# --- Worker/runtime config
WORKER_COUNT=9
DB_MAX_CONCURRENCY=1
FUNCTION_BASE_URL=http://localhost:7071/api

# --- Transaction tuning (big per-page txn)
PRISMA_TX_MAX_WAIT_MS=210000     # 3.5 min to obtain a txn slot
PRISMA_TX_TIMEOUT_MS=900000      # 15 min page runtime (raise to 1800000 for 30 min if needed)

# --- Optional: control page mode (default 'transaction')
PAGE_TXN_MODE=transaction
```

> Keep **all secrets** in `.env`; do **not** put them in `local.settings.json`.

---

## Prisma clients (two schemas)

We use two Prisma schemas:
- `prisma/schema.prisma` → main app DB → output: `node_modules/@prisma/app-client`
- `prisma/schema.timescale.prisma` → Timescale DB → output: `node_modules/@prisma/ts-client`

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "prisma:generate:main": "prisma generate --schema=./prisma/schema.prisma",
    "prisma:generate:timescale": "prisma generate --schema=./prisma/schema.timescale.prisma",
    "prisma:generate": "npm run prisma:generate:main && npm run prisma:generate:timescale"
  }
}
```

Generate both:
```bash
npm run prisma:generate
```

---

## Local run (Core Tools)

1. Minimal `local.settings.json` (root):
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node"
  }
}
```

2. Start Azurite (foreground) or in background:
```bash
# foreground
azurite

# background (Linux)
mkdir -p .azurite
npx azurite --location ./.azurite --silent > ./.azurite/out.log 2>&1 &
echo $! > ./.azurite/pid
```

3. Build + start Functions:
```bash
npm run prisma:generate
npm run start
```
Where `package.json` (suggested):
```json
{
  "scripts": {
    "clean": "rimraf dist",
    "build": "tsc",
    "start": "npm run clean && npm run build && func start --script-root dist"
  }
}
```

> If you **don’t** need timers locally, set `ENABLE_TIMERS=0` in `.env` to skip registering timer functions.

---

## Docker: single container

Build & run with your local `.env`:
```bash
docker build -t pokemon-card-updater .
docker run --env-file .env -p 7071:7071 pokemon-card-updater
```

**Note:** Inside the container, if you want timers/diagnostics, set a full `AzureWebJobsStorage` connection string (e.g., pointing to Azurite or real Storage). `UseDevelopmentStorage=true` works only if you’re also running Azurite on the host and publish the ports properly with a full connection string.

---

## Docker Compose: app + Azurite

A `docker-compose.yml` is included. It brings up **Azurite** and the **app**, already wired:

```bash
docker compose up -d --build
docker compose logs -f app
# stop
docker compose down
```

- App HTTP: `http://localhost:7071/api`
- Azurite: ports `10000/10001/10002`

---

## systemd: run Core Tools at boot

If you want to run the Functions host (Core Tools) as a service, use `systemd/pokemon-func.service`.

### 1) Edit the unit to match your paths
- `WorkingDirectory=` → path to your repo (e.g., `/home/<user>/pokemon-card-updater`)
- `EnvironmentFile=` → points to `.env` (optional; dotenv in code also loads it)

### 2) Install & enable
```bash
sudo cp systemd/pokemon-func.service /etc/systemd/system/pokemon-func.service
sudo systemctl daemon-reload
sudo systemctl enable pokemon-func
sudo systemctl start pokemon-func
```

### 3) Manage the service
```bash
sudo systemctl status pokemon-func
sudo systemctl restart pokemon-func
sudo systemctl stop pokemon-func
journalctl -u pokemon-func -f
```

> When you edit the unit file, always run `sudo systemctl daemon-reload` before restart.

---

## systemd: run Docker Compose at boot

If you prefer the Docker Compose route, use `systemd/pokemon-updater-compose.service`.
This unit will run `docker compose up -d` on start and `docker compose down` on stop.

### 1) Edit the unit to match your repo path
- `WorkingDirectory=` → your repo path containing `docker-compose.yml`

### 2) Install & enable
```bash
sudo cp systemd/pokemon-updater-compose.service /etc/systemd/system/pokemon-updater-compose.service
sudo systemctl daemon-reload
sudo systemctl enable pokemon-updater-compose
sudo systemctl start pokemon-updater-compose
```

### 3) Manage
```bash
sudo systemctl status pokemon-updater-compose
sudo systemctl restart pokemon-updater-compose
sudo systemctl stop pokemon-updater-compose
journalctl -u pokemon-updater-compose -f
```

The compose unit declares `Requires=docker.service` and `After=docker.service` so Docker is up first.

---

## Timeouts & concurrency quick guide

- `connection_limit=1` in both DB URLs → **one DB connection per worker per DB**
- `pool_timeout` (in URLs) → wait time to **obtain a connection** from the pool
- `PRISMA_TX_MAX_WAIT_MS` → wait time to **begin** the interactive transaction
- `PRISMA_TX_TIMEOUT_MS` → max **duration** of the page transaction
- `DB_MAX_CONCURRENCY=1` → one page at a time per worker (stable connections)
- `WORKER_COUNT=9` → nine workers in parallel

Start with:
```
pool_timeout=300
PRISMA_TX_MAX_WAIT_MS=210000
PRISMA_TX_TIMEOUT_MS=900000  (use 1800000 if pages still time out)
```

---

## Troubleshooting

- **“Connection refused (127.0.0.1:10000)”**  
  Azurite isn’t running (for Core Tools) or `AzureWebJobsStorage` in the container isn’t set to a full Azurite connection string.  
  - Core Tools: start Azurite or use a real Storage conn string in `local.settings.json`  
  - Compose: already wired in `docker-compose.yml`

- **“Timed out fetching a new connection from the pool”**  
  Raise `pool_timeout`. Keep `connection_limit=1` and per-worker clients.

- **“Unable to start a transaction in the given time.”**  
  Raise `PRISMA_TX_MAX_WAIT_MS` (≥ pool_timeout + buffer).

- **“Transaction already closed … timeout …”**  
  Raise `PRISMA_TX_TIMEOUT_MS` (15–30 minutes on slow hardware).

---

## Provided files

- `Dockerfile` (multi-stage, Node 20, Azure Functions host)
- `.dockerignore`
- `docker-compose.yml` (app + Azurite, pre-wired storage connection string)
- `systemd/pokemon-func.service` (Core Tools service)
- `systemd/pokemon-updater-compose.service` (Docker Compose service)
- `scripts/install-systemd.sh` (helper to install/enable services)
