
<p align="center">
  <img width="700" height="259" alt="Untitled design (36)" src="https://github.com/user-attachments/assets/e6b414d0-b73f-45f0-b40c-54922559d0f9" />
</p>


# What is Vulnerix?

Vulnerix is an Opensource Vulnerability intelligence and reporting platform that matches your tech stack against CVE's of NVD and CERT-IN advisories and surfaces actionable security insights.


Open source gave us the foundation. This is our way of giving back — built for Indian MSMEs. 🙏 India First 🇮🇳 
* 🔍 Maps your tech stack against NVD & CERT-IN advisories
* 📊 Real-time dashboard + alerts for MSMEs & MSSPs
* 💡 Free. Open Source. Community-driven.


# why we build it?

It started with a client conversation.
One of our long-standing clients — a cloud-first organization running their entire operations on SaaS and cloud applications — came to us with a simple ask:

> "We're on your SIEM & SOC. We're trying to stay ISO 27001 compliant and meet SEBI & RBI guidelines, yet we're not willing to stack another VA scanner on top of our existing spend just to get a timely heads-up on CVEs. There has to be a smarter way. Can you think of something for us?"

They weren't asking for a complex enterprise scanner — they just didn't want yet another tool. They wanted something simple, timely, and relevant to their stack.
We looked around. Nothing quite fit.
So we built it ourselves.

# Demo


https://github.com/user-attachments/assets/2ebc7bae-6002-4256-91c9-f12d3b05a498


## Architecture

```
NVD API ──► nvd_fetcher.py ──────────────────────┐
                                                   ▼
CERT-IN ──► daily_cert_extract.py ──► cert_in_cves table
         └► cert_in_past_data_extract.py           │
                                                   ▼
Frontend (React) ──► tech_stack table ──► cve-engine (Edge Function)
                                               │
                                    nvd_cves ──┤
                                  cert_in_cves ┘
                                               │
                                               ▼
                                   tech_stack_results ──► Dashboard
```
## Future Roadmap
- Introduce Remediation steps using AI (BYOK)
- Integrate CISA-KEV Feeds
- Develop webhook, more notification channels
- Automatic tech stack updation
 
## Prerequisites

- Docker Desktop
- Python 3.8+
- Node.js 18+
- NVD API key — [register here](https://nvd.nist.gov/developers/request-an-api-key)

## Quick Start

### 1. Start Supabase

```bash
cd Supabase/docker
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, JWT_SECRET, SMTP credentials
# IMPORTANT: Set SITE_URL to your frontend URL (used in password reset emails)
#   - Local: SITE_URL=http://localhost
#   - Server: SITE_URL=http://<your-server-ip>
docker compose up -d
```

Supabase Studio will be available at `http://localhost:8000`
Login: `supabase` / (your DASHBOARD_PASSWORD from .env)

### 2. Run Database Migrations

```bash
cd Vulnerix
python setup_db.py --dry-run   # verify DB connection first
python setup_db.py             # run all migrations + grants
```

This runs all SQL migrations in order and sets up the required table ownership and grants automatically. Migrations are idempotent — safe to re-run on existing databases (already-applied migrations will be skipped).

### 3. Configure Environment

```bash
cd Vulnerix
cp .env.example .env
# Edit .env — fill in your NVD_API_KEY, POSTGRES_PASSWORD, Supabase keys
```

### 4. Install Python Dependencies

```bash
pip install -r Vulnerix/requirements.txt
```

### 5. Fetch NVD Data

```bash
# Dry run to validate config
python Vulnerix/nvd_fetcher.py --dry-run

# Fetch CVEs (NVD_START_YEAR from .env, e.g. 2021)
python Vulnerix/nvd_fetcher.py
```

This takes ~10-20 minutes for a full year. Progress is shown per 90-day window.

### 6. Fetch CERT-IN Data

```bash
# One-time historical fetch (use --limit for testing)
python Vulnerix/cert_in_past_data_extract.py --start-year 2026 --limit 100

# Daily incremental (run via cron/task scheduler)
python Vulnerix/daily_cert_extract.py
```

### 7. Deploy Edge Functions

```bash
# Linux — from the Vulnerix directory
chmod +x deploy-functions.sh
./deploy-functions.sh

# Deploy a single function
./deploy-functions.sh cve-engine
```

```powershell
# Windows — from the Vulnerix directory
.\deploy-functions.ps1

# Deploy a single function
.\deploy-functions.ps1 cve-engine
```

### 8. Configure Edge Function Environment Variables

The edge functions (especially `send-email`) need environment variables that must be passed through `docker-compose.yml`. The Supabase `.env` file alone is not enough — you must explicitly map the vars into the `supabase-edge-functions` container.

Add the following `environment:` block to the `supabase-edge-functions` service in `Supabase/docker/docker-compose.yml`:

```yaml
  supabase-edge-functions:
    container_name: supabase-edge-functions
    image: supabase/edge-runtime:v1.71.2
    restart: unless-stopped
    volumes:
      - ./volumes/functions:/home/deno/functions:Z
    environment:
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SUPABASE_URL: http://kong:8000
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}
      EXTRA_ALLOWED_ORIGINS: ${EXTRA_ALLOWED_ORIGINS:-}
```

Then add these to `Supabase/docker/.env`:

```env
# SMTP (for send-email edge function)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password

# Frontend origin (if not localhost) — comma-separated for multiple
EXTRA_ALLOWED_ORIGINS=http://your-server-ip,https://your-domain.com
```

After updating, recreate the container:

```bash
cd Supabase/docker
docker compose up -d supabase-edge-functions
```

Verify vars are loaded:

```bash
docker exec supabase-edge-functions env | grep SMTP
```

### 9. Build and Run Frontend

```bash
docker build -t vulnerix-frontend \
  --build-arg VITE_SUPABASE_URL=http://localhost:8000 \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key> \
  Vulnerix

docker run -d --name vulnerix-frontend -p 80:80 vulnerix-frontend
```

Frontend available at `http://localhost`

## Testing the Pipeline

1. Register a user at `http://localhost`
2. Go to Tech Stack → add an entry, e.g:
   - Vendor: `microsoft`, Product: `azure_devops`, Version: `*`
3. The CVE engine triggers automatically
4. Dashboard should show matched advisories within seconds

Verify in Studio:
```sql
SELECT source, COUNT(*) FROM tech_stack_results GROUP BY source;
```

## Project Structure

```
Vulnerix/
├── src/                          # React frontend
│   ├── hooks/
│   │   ├── useCVEEngine.ts       # Triggers CVE matching engine
│   │   └── useSupabaseData.ts    # Reads tech_stack_results for UI
│   └── pages/
│       ├── Dashboard.tsx
│       └── Advisories.tsx
├── supabase/
│   ├── functions/
│   │   ├── cve-engine/           # Matching engine (NVD + CERT-IN)
│   │   ├── send-email/           # Email notifications
│   │   └── delete-user/         
│   └── migrations/               # SQL schema files
├── nvd_fetcher.py                # Fetches NVD CVEs → nvd_cves table
├── cert_in_past_data_extract.py  # Historical CERT-IN → cert_in_cves
├── daily_cert_extract.py         # Daily CERT-IN incremental
├── cert_in_db.py                 # Shared DB utilities for CERT-IN scripts
├── requirements.txt              # Python dependencies
└── .env.example                  # Environment variable template

Supabase/docker/                  # Self-hosted Supabase
├── docker-compose.yml
├── .env.example
└── volumes/
    └── functions/                # Edge functions served from here
```

## Database Tables

| Table | Description |
|-------|-------------|
| `nvd_cves` | NVD vulnerability catalogue with CPE version ranges (populated by nvd_fetcher.py) |
| `cert_in_cves` | CERT-IN advisories (populated by cert_in scripts) |
| `tech_stack` | User's registered products/vendors (unique per user+vendor+product+version) |
| `tech_stack_results` | Matched vulnerabilities per user (source: nvd / cert_in) |
| `demo_requests` | Demo request form submissions from landing page |
| `contact_messages` | Contact form submissions from authenticated users |

## Key Behaviors

- **Duplicate tech stack prevention**: Same vendor+product+version cannot be added twice per user (enforced at DB and UI level)
- **Cascade delete**: Deleting a tech stack entry automatically removes its matched advisories
- **Version-aware matching**: The CVE engine uses NVD version ranges (versionStartIncluding, versionEndIncluding, etc.) to only match CVEs that actually affect your specific version
- **Password reset validation**: Only registered users can receive password reset emails
- **Email notifications**: Contact form, demo requests, and advisory alerts all send emails via the `send-email` edge function

## Adding a New Vulnerability Source

The CVE engine uses a pluggable matcher pattern. To add a new source:

1. Create a fetcher script (follow `nvd_fetcher.py` as template)
2. Create a DB table for the source data
3. Add a `match_<source>` SQL function
4. Implement `VulnMatcher` interface in `supabase/functions/cve-engine/index.ts`
5. Add to the `MATCHERS` array

## Scheduling

For production, schedule these scripts:

```bash
# Daily CERT-IN update (cron example)
0 6 * * * cd /path/to/repo && python Vulnerix/daily_cert_extract.py

# Weekly NVD refresh (picks up newly published CVEs)
0 2 * * 0 cd /path/to/repo && python Vulnerix/nvd_fetcher.py
```
