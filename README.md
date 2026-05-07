# Monitoring Dashboard

A full-stack Spring Boot + React application for DB-driven SQL monitoring. It executes SQL queries against target databases on a configurable schedule, persists results, and sends email + Slack alerts with Excel attachments when issues are detected.

## Overview

The service:

1. **Reads monitoring jobs** from the `monitoring_queries` database table
2. **Executes SQL queries** against target databases on a cron schedule
3. **Persists results** to the `monitoring_results` table for audit/history
4. **Sends alerts** via email (SendGrid) + Slack when issues are detected
5. **Skips alerts** if zero rows found or an alert was already sent today

All monitoring items and schedules are **database-driven** — no code changes required to add or modify monitoring rules.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Spring Boot | 3.3.13 |
| **Language** | Java | 21 |
| **Build** | Gradle | 8.9 |
| **Frontend** | React + TypeScript | - |
| **Build Tool (FE)** | Vite | - |
| **Email** | SendGrid Java SDK | 4.10.1 |
| **Excel** | Apache POI (poi-ooxml) | 5.3.0 |
| **Service DB** | MariaDB | via env vars |
| **Migrations** | Flyway | 9.22.3 |
| **Quality** | Checkstyle 10.25.0, JaCoCo, SonarQube |
| **Container** | Docker | - |
| **CI/CD** | GitLab CI | - |

## Project Structure

```
monitoring-dashboard/
├── backend/                                           # Spring Boot application
│   ├── src/main/
│   │   ├── java/.../monitoring/
│   │   │   ├── config/
│   │   │   │   ├── SchedulerConfig.java                   # ThreadPoolTaskScheduler (pool=10)
│   │   │   │   └── SendGridConfig.java                    # SendGrid bean
│   │   │   ├── model/
│   │   │   │   ├── entity/
│   │   │   │   │   ├── MonitoringQuery.java               # JPA entity for monitoring_queries
│   │   │   │   │   ├── MonitoringResult.java              # JPA entity for monitoring_results
│   │   │   │   │   └── MonitoringResultRow.java           # JPA entity for monitoring_result_rows
│   │   │   │   ├── request/                               # API request DTOs
│   │   │   │   ├── response/                              # API response DTOs
│   │   │   │   ├── enums/
│   │   │   │   │   └── ResultStatus.java                  # SUCCESS / FAIL / SKIPPED
│   │   │   │   ├── ReportSheet.java                       # Excel report model
│   │   │   │   └── SheetSpec.java                         # Sheet specification
│   │   │   ├── props/                                     # DB + email config properties
│   │   │   ├── repository/                                # JPA repositories
│   │   │   └── service/
│   │   │       ├── MonitoringSchedulerService.java        # @PostConstruct: reads DB, registers cron tasks
│   │   │       ├── MonitoringExecutionService.java        # Orchestrator: query→persist→alert
│   │   │       ├── TargetDbQueryService.java              # Direct JDBC queries (all target DBs)
│   │   │       ├── ExcelReportService.java                # Apache POI xlsx generation
│   │   │       ├── MonitoringEmailService.java            # SendGrid email + attachment
│   │   │       ├── SlackNotificationService.java          # Slack incoming webhook
│   │   │       └── DwSyncService.java                     # DW sync (frequent items)
│   │   │
│   │   └── resources/
│   │       ├── application.yml                            # Base configuration
│   │       ├── application-local.yml                      # LOCAL profile
│   │       ├── logback-spring.xml                         # Logging config
│   │       └── flyway/
│   │           ├── common/                                # Migrations for all environments
│   │           └── env_sql/                               # Environment-specific migrations
│   │
│   ├── manifests/                                         # Kubernetes secrets (per environment)
│   ├── Dockerfile
│   └── build.gradle
│
├── frontend/                                          # React + Vite dashboard
│   ├── src/
│   │   ├── api/monitoring.ts                          # Axios API client
│   │   ├── components/ui/                             # shadcn/ui component library
│   │   ├── pages/DashboardPage.tsx                    # Main dashboard (search, bulk run, CRUD)
│   │   ├── types/monitoring.ts                        # TypeScript types
│   │   └── App.tsx
│   └── package.json
│
└── .gitlab-ci.yml                                     # CI/CD pipeline
```

## Database Architecture

### Multiple JDBC Connections

The service uses **one Spring datasource (JPA/Flyway)** for its own data plus **raw JDBC connections** to target databases being monitored:

| Connection | Purpose |
|------------|---------|
| JPA / Flyway | Service data + migrations |
| Raw JDBC (per `db_type`) | Execute monitoring queries against target DBs |

Raw JDBC connections are opened per job execution and closed via try-with-resources — no persistent connection pool.

### Schema

Key tables in the service database:

- **`monitoring_queries`** — Job definitions
  - `title`, `description`, `db_type`, `sql_query`, `query_interval` (cron)
  - `sheet_name`, `owner_name`, `owner_email`, `recipients`
  - `active_yn`, `frequent_yn`, `color` (dashboard display color)
  - `created_at`, `updated_at`

- **`monitoring_results`** — Execution history
  - `run_at`, `run_date`, `result_count`, `result_status`
  - `execution_ms`, `triggered_alert_yn`, `dw_synced_yn`
  - `error_message`, `error_detail` (full stack trace for FAIL)

- **`monitoring_result_rows`** — Per-row data from query results
  - `row_index`, `row_data` (JSON)
  - `row_status` (OPEN/IN_PROGRESS/DONE), `row_comment`

- **`item_history`** — Audit log of changes to monitoring_queries

## How Scheduling Works

`MonitoringSchedulerService` runs at startup (`@PostConstruct`):

1. Reads all rows from `monitoring_queries` WHERE `active_yn = 'Y'`
2. For each row, registers a `CronTrigger` using its `query_interval` field
3. Each trigger fires and calls `MonitoringExecutionService.execute(item)`

**Execution flow per item:**

```
MonitoringSchedulerService (cron fires)
  → MonitoringExecutionService.execute(item)
      ├── Resolve JDBC URL by db_type
      ├── TargetDbQueryService.query(jdbcUrl, sql) — direct JDBC, 3-attempt retry
      │     └── On failure: persist FAIL result with error_message + error_detail
      ├── Persist MonitoringResult → monitoring_results (rows → monitoring_result_rows)
      ├── IF result_count > 0 AND not already alerted today:
      │     ├── ExcelReportService.generate() → xlsx bytes
      │     ├── MonitoringEmailService.sendReport() → SendGrid
      │     └── SlackNotificationService.sendAlert() → webhook
      └── IF frequent_yn = 'Y':
            └── DwSyncService.sync() → set dw_synced_yn = 'Y'
```

**No code changes or redeploy needed** — just update the database and restart the service.

## REST API

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| **POST** | `/v1/monitoring-queries/create` | Create a new monitoring query (returns 201) |
| **GET** | `/v1/monitoring-queries` | List all queries (optional `?active=Y\|N`) |
| **GET** | `/v1/monitoring-queries/{id}` | Get one query by ID |
| **POST** | `/v1/monitoring-queries/{id}/update` | Update query config fields |
| **DELETE** | `/v1/monitoring-queries/{id}` | Delete query and all its results |
| **POST** | `/v1/monitoring-queries/{id}/run` | Trigger async execution (returns 202) |
| **GET** | `/v1/monitoring-results` | Paginated results (`?resultId=&id=&date=&page=&size=`) |
| **PATCH** | `/v1/monitoring-result-rows/{rowId}` | Update row status (OPEN/IN_PROGRESS/DONE) and comment |

### OpenAPI / Swagger
```
http://localhost:8080/openapi/v3/docs
http://localhost:8080/swagger-ui.html
```

## Quick Start

### Prerequisites

- **Java 21** (toolchain configured in build.gradle)
- **Gradle 8.9** (wrapper included)
- **MariaDB/MySQL** (local development via Docker)
- **Node.js 18+** (for frontend)

### Backend Setup (Java)

#### 1. Clone & Navigate
```bash
cd monitoring-dashboard/backend
```

#### 2. Local Development (with Flyway migrations)
```bash
# Set profile to LOCAL — enables Flyway + uses local DB defaults
./gradlew bootRun --args='--spring.profiles.active=LOCAL'

# In another terminal, run migrations (LOCAL only)
./gradlew flywayMigrate
```

#### 3. Non-Local Profiles (DEV, QA, STG, PRD)
```bash
# Set environment variables (see Environment Variables below)
export DB_HOST=your-db-host
export DB_PORT=3306
# ... etc

./gradlew bootRun --args='--spring.profiles.active=DEV'
```

#### 4. Build & Test
```bash
./gradlew build
./gradlew test
./gradlew test jacocoTestReport
# View: build/reports/jacoco/test/html/index.html
./gradlew checkstyleMain
./gradlew sonarqube
```

### Frontend Setup (React + Vite)

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

## Local Development (Docker)

### Start MariaDB Instances
```bash
# Example ports used in application-local.yml:
# - Service DB:  127.0.0.1:3318
# - Target DB 1: 127.0.0.1:3315
# - Target DB 2: 127.0.0.1:3317
# - Target DB 3: 127.0.0.1:3319

docker-compose up -d
```

### Flyway Local Migrations
```bash
cd backend
./gradlew flywayMigrate

# Reset schema (destructive, LOCAL only)
./gradlew flywayClean
```

### Default Credentials (LOCAL)
```yaml
# application-local.yml hardcodes:
DB_HOST: 127.0.0.1
DB_PORT: 3318
DB_USER: root
DB_PASSWORD: password
```

## Environment Variables

### Service Database

| Variable | Description | Default (LOCAL) |
|----------|-------------|-----------------|
| `DB_HOST` | MariaDB host | `127.0.0.1` |
| `DB_PORT` | MariaDB port | `3318` |
| `DB_USER` | Username | `root` |
| `DB_PASSWORD` | Password | `password` |

### Target Databases (Query Execution)

Configure each target database used by your `db_type` values (`DATABASE1`–`DATABASE4`):

| Variable | Description | Default (LOCAL) |
|----------|-------------|-----------------|
| `DB1_HOST` / `DB1_PORT` / `DB1_NAME` / `DB1_USER` / `DB1_PASSWORD` | DATABASE1 connection | `127.0.0.1:3315` |
| `DB2_HOST` / `DB2_PORT` / `DB2_NAME` / `DB2_USER` / `DB2_PASSWORD` | DATABASE2 connection | `127.0.0.1:3316` |
| `DB3_HOST` / `DB3_PORT` / `DB3_NAME` / `DB3_USER` / `DB3_PASSWORD` | DATABASE3 connection | `127.0.0.1:3317` |
| `DB4_HOST` / `DB4_PORT` / `DB4_NAME` / `DB4_USER` / `DB4_PASSWORD` | DATABASE4 connection | `127.0.0.1:3319` |

### Email & Notifications

| Variable | Description | Default |
|----------|-------------|---------|
| `SENDGRID_API_KEY` | SendGrid API key | (required for non-LOCAL) |
| `SENDGRID_ENABLED` | Enable/disable email | `false` (LOCAL) |
| `EMAIL_FROM` | Sender email address | `donotreply@example.com` |
| `EMAIL_FROM_NAME` | Sender display name | `Monitoring Dashboard` |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | (optional) |

## Deployment

### Frontend (Netlify)

The frontend is a Vite SPA and can be deployed standalone to Netlify (the API client currently uses in-memory mock data, so no backend is required for a demo deploy).

Repo-root config files:

- **`netlify.toml`** — sets `base = "frontend"`, build command, and publish dir (`dist`, relative to base)
- **`.nvmrc`** — pins Node 20 (Vite 7 requires Node 20+)

Steps:

1. Push the repo to GitHub.
2. In Netlify, **Add new site → Import from Git** and select the repo. Build settings auto-detect from `netlify.toml`.
3. Deploy.

To deploy from the CLI instead:

```bash
npm install -g netlify-cli
netlify deploy --build --prod
```

To point the frontend at a real backend later, replace the mock implementations in `frontend/src/api/monitoring.ts` with axios calls and set `VITE_API_BASE_URL` in Netlify's environment variables.

### Docker Container

```bash
# Build image
docker build -t monitoring-dashboard:latest ./backend

# Run container
docker run -d \
  -e SPRING_PROFILES_ACTIVE=DEV \
  -e DB_HOST=db.example.com \
  -e DB_USER=app \
  -e DB_PASSWORD=secret \
  -e DB1_HOST=db1.example.com \
  -e DB1_NAME=mydb1 \
  -e DB1_USER=app \
  -e DB1_PASSWORD=secret \
  -e SENDGRID_API_KEY=sg_... \
  -p 8080:8080 \
  --name monitoring-dashboard \
  monitoring-dashboard:latest
```

### Kubernetes
```bash
kubectl apply -f backend/manifests/
```

See `.gitlab-ci.yml` for CI/CD pipeline configuration using AWS Secrets Manager.

## Development Workflow

### Create a New Monitoring Item

**Option A: REST API**
```bash
curl -X POST http://localhost:8080/v1/monitoring-queries/create \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "New Alert",
    "description": "Description",
    "dbType": "DATABASE1",
    "sqlQuery": "SELECT * FROM ...",
    "queryInterval": "0 9 * * MON-FRI",
    "sheetName": "Sheet1",
    "ownerName": "Team",
    "ownerEmail": "team@example.com",
    "recipients": "user1@example.com,user2@example.com",
    "activeYn": "Y",
    "frequentYn": "N"
  }'
```

**Option B: Database Insert**
```sql
INSERT INTO monitoring_queries (
  title, description, db_type, sql_query, query_interval,
  sheet_name, owner_name, owner_email, recipients, active_yn, frequent_yn
) VALUES (
  'New Alert', 'Description', 'DATABASE1', 'SELECT * FROM ...',
  '0 9 * * MON-FRI',
  'Sheet1', 'Team', 'team@example.com', 'user1@example.com,user2@example.com', 'Y', 'N'
);
-- Restart service to pick up new item
```

### Update a Monitoring Item
```bash
curl -X POST http://localhost:8080/v1/monitoring-queries/1/update \
  -H 'Content-Type: application/json' \
  -d '{"sqlQuery": "SELECT * FROM ...", "queryInterval": "0 12 * * *"}'
```

### Run On-Demand
```bash
curl -X POST http://localhost:8080/v1/monitoring-queries/1/run
# Returns 202 Accepted
```

### Update Result Row Status
```bash
curl -X PATCH http://localhost:8080/v1/monitoring-result-rows/42 \
  -H 'Content-Type: application/json' \
  -d '{"rowStatus": "IN_PROGRESS", "rowComment": "Investigating"}'
# rowStatus values: OPEN | IN_PROGRESS | DONE
```

## Code Quality

```bash
cd backend
./gradlew checkstyleMain          # Checkstyle
./gradlew test jacocoTestReport   # Coverage report
./gradlew sonarqube               # SonarQube (requires SONAR_TOKEN + SONAR_HOST_URL env vars)
```

### Coverage Exclusions
- `**/config/**`, `**/constant/**`, `**/model/**`, `**/props/**`
- `**/*Application.class`, `**/test/java/**`

## Troubleshooting

**Connection refused?**
- Verify MariaDB is running and accessible
- Check `DB_HOST`, `DB_PORT`, and credentials

**Flyway migration failed?**
- Check SQL syntax in `backend/src/main/resources/flyway/`
- Run `./gradlew flywayClean` to reset (LOCAL only)

**Monitoring queries not executing?**
- Check `active_yn = 'Y'` in `monitoring_queries` table
- Verify cron expression in `query_interval` (Spring 6-field format: `s m h d M DOW`)

**No emails?**
- Verify `SENDGRID_API_KEY` is set and `SENDGRID_ENABLED=true`
- Verify `recipients` field in `monitoring_queries`

**Slack not posting?**
- Verify `SLACK_WEBHOOK_URL` is set
- Test: `curl -X POST <webhook-url> -d '{"text":"test"}'`

## License

MIT
