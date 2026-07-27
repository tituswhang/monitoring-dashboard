-- ============================================================
--  Monitoring Dashboard — seed the first admin
--  V1_1_8
--
--  Lives in flyway/common, which every environment's `locations`
--  includes, so this reaches LOCAL/DEV/QA/STG/PRD alike.
--
--  This is a ONE-TIME assertion, not a standing guarantee: Flyway runs a
--  migration once per schema and never again. If this row is later demoted
--  or deleted, nothing here brings it back. The standing guarantee is
--  AUTH_BOOTSTRAP_ADMINS, which is read on every request and cannot be
--  edited away from the admin UI. Keep both: this row makes the account a
--  real, listable user, and the env var makes its admin rights survive
--  anything that happens to the row.
--
--  The seeded address is a placeholder. Replace it (or rely on
--  AUTH_BOOTSTRAP_ADMINS instead) before pointing this at a real
--  deployment — an example.com address can never receive an invite.
--
--  Idempotent on purpose. DEV runs with out-of-order=true and
--  validate-on-migrate=false, and the schema may be reseeded by hand, so
--  re-running this must be a no-op rather than a duplicate-key failure.
-- ============================================================

INSERT INTO app_user (email, name, active, created_by)
VALUES ('demo@example.com', 'Demo User', 1, 'V1_1_8 migration')
ON DUPLICATE KEY UPDATE
    active = 1,
    name = COALESCE(name, VALUES(name));

INSERT INTO app_user_role (user_id, role, granted_by)
SELECT id, 'ADMIN', 'V1_1_8 migration'
FROM app_user
WHERE email = 'demo@example.com'
ON DUPLICATE KEY UPDATE
    granted_by = app_user_role.granted_by;
