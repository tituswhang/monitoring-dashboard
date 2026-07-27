-- ============================================================
--  Monitoring Dashboard — app-managed roles
--  V1_1_7
--
--  Moves authorization out of Cognito. Cognito still answers "who is
--  this?"; these tables answer "what may they do?".
--
--  Roles key on lower-cased email, not the Cognito `sub`. The sub is a
--  per-pool UUID: it means nothing outside Cognito and would orphan every
--  row here if the pool were ever recreated or the IdP swapped — which is
--  the exact coupling this change exists to remove. Email is already this
--  app's identity of record (monitoring_case_activity attributes comments
--  by it), and it lets an admin grant a role to someone who has not logged
--  in yet.
--
--  external_subject is recorded for audit only. It is never the join key.
--
--  No seed rows: during phase 1 `auth.roles.source=both` unions these
--  tables with the legacy cognito:groups claim, so today's Cognito admins
--  keep their access with or without a row here. AUTH_BOOTSTRAP_ADMINS is
--  the lockout escape hatch. Seed real admins from the app's own UI once
--  phase 2 ships the write path.
-- ============================================================

CREATE TABLE app_user (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    email            VARCHAR(255) NOT NULL COMMENT 'Lower-cased; the identity key roles hang off',
    name             VARCHAR(255) NULL,
    external_subject VARCHAR(255) NULL COMMENT 'Cognito sub, for audit only — never joined on',
    active           TINYINT(1)   NOT NULL DEFAULT 1,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by       VARCHAR(255) NULL COMMENT 'Email of the admin who created this user',
    last_login_at    DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_app_user_email (email)
) COMMENT 'Application users. Authorization only — credentials still live in the identity provider';

CREATE TABLE app_user_role (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    user_id    BIGINT       NOT NULL,
    role       VARCHAR(32)  NOT NULL COMMENT 'ADMIN | EDITOR | VIEWER — plain varchar so a new role needs no DDL',
    granted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    granted_by VARCHAR(255) NULL COMMENT 'Email of the admin who granted this role',
    PRIMARY KEY (id),
    UNIQUE KEY uk_app_user_role (user_id, role),
    CONSTRAINT fk_app_user_role_user
        FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE
) COMMENT 'Role membership. The role catalog itself is code (AppRole); only membership is data';
