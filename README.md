# DataWatch: E-Commerce Dashboard

A full-stack Spring Boot + Angular application for DB-driven SQL monitoring. It executes SQL queries against target databases on a configurable schedule, persists results as trackable *cases*, and publishes alert events when issues are detected.

**Live demo:** https://monitoring-dashboard-demo.netlify.app/ (frontend only, backed by in-memory mock data — sign in with any username and password)

## Overview

The service:

1. **Reads monitoring jobs** from the `monitoring_queries` database table
2. **Executes SQL queries** against target databases on a cron schedule, over a
   caller-supplied or per-item default date window
3. **Persists results** to the `monitoring_results` table for audit/history, recording the
   window each run actually scanned
4. **Tracks each row as a case** with a stable identity that survives across runs, so status,
   comments, and an activity timeline follow the case rather than the run
5. **Publishes alert events** to a downstream communication service (SQS) + Slack
6. **Skips alerts** if zero rows found, an alert was already sent today, or every matching
   case is already resolved

All monitoring items and schedules are **database-driven** — no code changes required to add or modify monitoring rules.

## Features

- **Case tracking** — rows are keyed by a stable case identity (increment id → configured
  identity columns → order id → row hash), so a recurring issue keeps its history, its
  first-seen date, and its comment thread instead of looking new on every run.
- **Activity timeline** — an append-only log of comments, status changes, and data drift per
  case, attributed to the signed-in user.
- **Team workload KPI** — who triaged which cases in a given month, plus what nobody touched.
- **Scan date ranges** — run an item over an explicit window, or widen the scan to reach past
  unresolved cases. Items still carrying a literal date floor hide the control rather than
  showing it do nothing.
- **Role-based access** — ADMIN / EDITOR / VIEWER, resolved from the app's own tables (not
  identity-provider groups) so roles are grantable from the dashboard itself.
- **On-hold items** — items blocked on an external action stay scheduled and visible but drop
  out of the dashboard totals, so the daily view only shows what is actionable.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Spring Boot | 3.3.13 |
| **Language** | Java | 21 |
| **Build** | Gradle | 8.9 |
| **Frontend** | Angular 21 + TypeScript | - |
| **Build Tool (FE)** | Angular CLI (esbuild) | - |
| **Data grid** | AG Grid Community | 35.3.0 |
| **Auth** | Spring Security + OAuth2 resource server (AWS Cognito) | - |
| **Alert transport** | AWS SQS (Spring Cloud AWS) | 3.1.0 |
| **API docs** | springdoc-openapi | 2.6.0 |
| **Service DB** | MariaDB | via env vars |
| **Migrations** | Flyway | 9.22.3 |
| **Quality** | Checkstyle 10.25.0, JaCoCo, SonarQube |
| **Container** | Docker | - |
| **CI/CD** | GitLab CI | - |

## Project Structure

```
datawatch/
├── backend/                                           # Spring Boot application
│   ├── src/main/
│   │   ├── java/.../monitoring/
│   │   │   ├── common/
│   │   │   │   ├── exception/                             # Typed domain exceptions
│   │   │   │   ├── security/                              # JWT decode, roles, filter chain
│   │   │   │   └── utils/                                 # Case-key resolution, drift detection
│   │   │   ├── config/
│   │   │   │   ├── SchedulerConfig.java                   # ThreadPoolTaskScheduler (pool=10)
│   │   │   │   ├── CognitoClientConfig.java               # Cognito admin SDK client
│   │   │   │   └── OpenApiConfig.java                     # springdoc customisation
│   │   │   ├── model/
│   │   │   │   ├── entity/
│   │   │   │   │   ├── MonitoringQuery.java               # JPA entity for monitoring_queries
│   │   │   │   │   ├── MonitoringResult.java              # JPA entity for monitoring_results
│   │   │   │   │   ├── MonitoringResultRow.java           # JPA entity for monitoring_result_rows
│   │   │   │   │   ├── MonitoringCaseActivity.java        # JPA entity for the case timeline
│   │   │   │   │   └── AppUser.java / AppUserRole.java    # Users and role grants
│   │   │   │   ├── request/                               # API request DTOs
│   │   │   │   ├── response/                              # API response DTOs
│   │   │   │   ├── event/                                 # Alert event envelope published to SQS
│   │   │   │   ├── enums/
│   │   │   │   │   ├── ResultStatus.java                  # SUCCESS / FAIL / SKIPPED
│   │   │   │   │   ├── CaseKeySource.java                 # Which rule produced a case key
│   │   │   │   │   └── AppRole.java / AppPermission.java  # Authorization catalog
│   │   │   │   └── QueryWindow.java                       # The date range a run scans
│   │   │   ├── props/                                     # DB + email config properties
│   │   │   ├── repository/                                # JPA repositories
│   │   │   └── service/
│   │   │       ├── MonitoringSchedulerService.java        # @PostConstruct: reads DB, registers cron tasks
│   │   │       ├── MonitoringExecutionService.java        # Orchestrator: query→persist→alert
│   │   │       ├── TargetDbQueryService.java              # Direct JDBC queries (all target DBs)
│   │   │       ├── QueryWindowResolver.java               # Validates and resolves scan ranges
│   │   │       ├── MonitoringEmailService.java            # Publishes alert events to SQS
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
├── frontend/                                          # Angular 21 dashboard
│   ├── src/app/
│   │   ├── core/                                      # Services and models
│   │   │   ├── monitoring.service.ts                  # API client (mock-backed in this build)
│   │   │   ├── mock-data.ts                           # In-memory fixtures on a rolling date spine
│   │   │   ├── auth.service.ts                        # Session, roles, demo login
│   │   │   ├── auth.guard.ts                          # Route gate; loads roles before first paint
│   │   │   ├── dashboard-store.ts                     # Signal store shared by every view
│   │   │   ├── theme.service.ts                       # Dark mode
│   │   │   └── models/monitoring.ts                   # TypeScript types
│   │   ├── features/
│   │   │   ├── shell/                                 # Sidebar, header, global search
│   │   │   ├── home/  category/  kpi/  person/        # Dashboard views
│   │   │   ├── query-detail/                          # Runs, scan range, results grid
│   │   │   ├── login/                                 # Cognito + demo sign-in
│   │   │   └── modals/                                # MatDialog: edit, history, activity, users
│   │   ├── shared/
│   │   │   ├── grid/                                  # AG Grid layer, cell renderers, set filter
│   │   │   ├── charts/                                # ECharts pie
│   │   │   ├── overlays/                              # CDK overlays, Material theme bridge
│   │   │   ├── ui/                                    # Card, badge, table, skeleton primitives
│   │   │   └── utils/xlsx.ts                          # Client-side Excel export
│   │   └── app.routes.ts                              # /query/:id, /category/:name, /kpi
│   ├── angular.json
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
  - `title`, `description`, `db_type`, `category`, `sql_query`, `query_interval` (cron)
  - `sheet_name`, `owner_name`, `owner_email`, `recipients`
  - `active_yn`, `frequent_yn`, `on_hold_yn`, `color` (dashboard display color)
  - `default_lookback_days` — how far back a scheduled run scans
  - `identity_columns`, `volatile_columns` — case-identity and drift configuration
  - `created_at`, `updated_at`

- **`monitoring_results`** — Execution history
  - `run_at`, `run_date`, `result_count`, `suppressed_count`, `result_status`
  - `begin_date`, `end_date`, `past_unresolved_yn` — the window this run actually scanned
  - `execution_ms`, `triggered_alert_yn`, `dw_synced_yn`
  - `error_message`, `error_detail` (full stack trace for FAIL)

- **`monitoring_result_rows`** — Per-row data from query results
  - `row_index`, `row_data` (JSON)
  - `row_status` (OPEN/IN_PROGRESS/DONE), `row_comment`
  - `case_key`, `case_key_source` — stable case identity and which rule produced it

- **`monitoring_case_activity`** — Append-only timeline per `(msor_id, case_key)`
  - `entry_type` (COMMENT / STATUS_CHANGE / DATA_CHANGE), `author_name`, `author_email`
  - `comment_text`, `field_name`, `old_value`, `new_value`, `created_at`

- **`app_user`, `app_user_role`** — Application users and their role grants. Authorization
  only; credentials stay with the identity provider. Keyed on lower-cased email rather than
  the provider's subject id, so a role can be granted before the person first signs in.

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
      ├── Resolve the scan window (caller's range, or the item's default lookback)
      ├── Resolve JDBC URL by db_type
      ├── TargetDbQueryService.query(jdbcUrl, sql) — direct JDBC, 3-attempt retry
      │     └── On failure: persist FAIL result with error_message + error_detail
      ├── Persist MonitoringResult → monitoring_results (rows → monitoring_result_rows)
      ├── IF result_count > 0 AND not already alerted today:
      │     ├── MonitoringEmailService.publish() → SQS alert event
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
| **POST** | `/v1/monitoring-queries/{id}/run` | Trigger async execution (returns 202). Optional `?beginDate=&endDate=&includePastUnresolved=` scan window |
| **POST** | `/v1/monitoring-queries/{id}/on-hold` | Set the on-hold flag (`?value=Y\|N`) |
| **GET** | `/v1/monitoring-results` | Paginated results (`?resultId=&id=&date=&page=&size=`) |
| **GET** | `/v1/monitoring-result-rows` | All cases, filterable by `dbType`, `rowStatus`, `msorId`, `fromDate`, `toDate` |
| **PATCH** | `/v1/monitoring-result-rows/{rowId}` | Update row status (OPEN/IN_PROGRESS/DONE) and comment |
| **GET** | `/v1/monitoring-cases/{id}/{caseKey}/activity` | Activity timeline for one case |
| **POST** | `/v1/monitoring-cases/{id}/{caseKey}/comments` | Add a comment to a case |
| **GET** | `/v1/kpi/case-workload` | Per-person case workload for a month (`?month=yyyy-MM`) |
| **GET** | `/v1/auth/me` | The caller's identity, roles, and permissions |
| **GET** | `/v1/admin/users` | List application users (ADMIN) |
| **POST** | `/v1/admin/users/invite` | Invite a user and assign roles (ADMIN) |
| **PUT** | `/v1/admin/users/{email}/roles` | Replace a user's role set (ADMIN) |
| **DELETE** | `/v1/admin/users/{email}` | Deactivate a user (ADMIN) |

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
- **Node.js 20.19+ / 22.12+** (for frontend — required by Angular 21)

### Backend Setup (Java)

#### 1. Clone & Navigate
```bash
cd datawatch/backend
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

### Frontend Setup (Angular)

```bash
cd frontend
npm install
npm start
# Runs on http://localhost:4200

npm run build   # production bundle
npm test        # unit tests (Vitest)
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
| `MONITORING_EMAIL_ENABLED` | Enable/disable alert publishing | `false` (LOCAL) |
| `EMAIL_FROM` | Sender email address | `donotreply@example.com` |
| `EMAIL_FROM_NAME` | Sender display name | `Monitoring Dashboard` |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | (optional) |
| `COMMUNICATION_EVENTS_QUEUE_URL` | SQS queue the alert events are published to | (empty) |
| `COMMUNICATION_EVENTS_EVENT_KEY` | Event key on the published envelope | `monitoring.alert` |
| `AWS_REGION` / `AWS_ACCESS_KEY` / `AWS_SECRET_KEY` | SQS credentials | `us-east-1` / empty |

### Authentication & Authorization

Auth is **off by default** so a fresh checkout runs without an identity provider; the deployed
profiles turn it on. The frontend mirrors this with `authEnabled` in `src/environments/` —
when it is false the SPA shows a local demo login and resolves the current user client-side,
which is how the hosted demo runs with no backend at all.

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_ENABLED` | Enforce authentication | `false` (base), `true` (deployed profiles) |
| `AUTH_ROLE_SOURCE` | `db`, `cognito`, or `both` | `both` |
| `AUTH_DEFAULT_ROLE` | Role for a signed-in user with no grants | `VIEWER` |
| `AUTH_DEMO_ROLE` | Role handed out when `AUTH_ENABLED=false` | `ADMIN` |
| `AUTH_BOOTSTRAP_ADMINS` | Comma-separated emails that are always ADMIN | (empty) |
| `COGNITO_ISSUER_URI` | Cognito user-pool issuer | placeholder |
| `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID` / `COGNITO_CLIENT_SECRET` / `COGNITO_DOMAIN` | Cognito app client | (empty) |
| `COGNITO_REDIRECT_URI` | OAuth callback | `http://localhost:8080/monitoring/v1/auth/callback` |
| `COGNITO_POST_LOGIN_REDIRECT_URI` | Where a signed-in user lands | `http://localhost:4200/` |
| `DASHBOARD_URL` | Link sent to invitees | falls back to the post-login redirect |

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
Angular has no `import.meta.env`, so these are build-time fields in
`src/environments/environment.ts` (swapped for `environment.prod.ts` on a production build)
rather than environment variables.

| Field | Description | Default |
|-------|-------------|---------|
| `authEnabled` | `true` restores the real Cognito flow; `false` is demo login | `false` (demo) |
| `shopAdminOrderUrl` | Base URL for deep-linking an order into a shop admin. When empty, order numbers render as plain text | `''` |

## Deployment

### Frontend (Netlify)

The frontend is an Angular SPA and can be deployed standalone to Netlify (the API client currently uses in-memory mock data, so no backend is required for a demo deploy). A live build is hosted at https://monitoring-dashboard-demo.netlify.app/.

Repo-root config files:

- **`netlify.toml`** — sets `base = "frontend"`, build command, publish dir
  (`dist/datawatch/browser`, relative to base), and a catch-all redirect to
  `index.html`. The redirect is required: the app routes on real paths (`/query/42`), so
  without it every deep link and refresh would 404.
- **`.nvmrc`** — pins Node 22. Angular 21 requires `^20.19.0 || ^22.12.0 || >=24.0.0`; a bare
  `20` resolves to whatever 20.x the build image ships, which may predate 20.19 and fail.

Steps:

1. Push the repo to GitHub.
2. In Netlify, **Add new site → Import from Git** and select the repo. Build settings auto-detect from `netlify.toml`.
3. Deploy.

To deploy from the CLI instead:

```bash
npm install -g netlify-cli
netlify deploy --build --prod
```

The mock layer is confined to `frontend/src/app/core/monitoring.service.ts`, whose method
signatures match the real HTTP client one-for-one — pointing the SPA at a live service means
replacing that one service's bodies with HTTP calls against `/v1`, and setting
`authEnabled: true` so the Cognito sign-in flow replaces the demo login. Nothing else in the
app knows the difference.

### Docker Container

```bash
# Build image
docker build -t datawatch:latest ./backend

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
  -e COMMUNICATION_EVENTS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/... \
  -p 8080:8080 \
  --name datawatch \
  datawatch:latest
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
- Verify `COMMUNICATION_EVENTS_QUEUE_URL` is set and `MONITORING_EMAIL_ENABLED=true`
- Verify `recipients` field in `monitoring_queries`

**Slack not posting?**
- Verify `SLACK_WEBHOOK_URL` is set
- Test: `curl -X POST <webhook-url> -d '{"text":"test"}'`

## License

MIT
