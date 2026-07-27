-- ============================================================
--  Monitoring Dashboard — add category to monitoring_queries
--  V1_0_4  (MySQL / MariaDB)
--
--  Adds a category dimension so the dashboard can group/filter
--  monitoring items instead of presenting one long flat list.
--
--  Existing rows are bucketed by a keyword CASE on title. New rows
--  inserted by an admin tool default to 'Other' until categorised.
--  Taxonomy: PG / Payment, Reward, Order Delivery, Order Validation,
--  BOPIS, Cancel / Refund, Export & ERP I/F, Interface Health,
--  Marketplace, ESP, TPA, Membership, Service, Other.
-- ============================================================

ALTER TABLE monitoring_queries
    ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'Other'
        COMMENT 'Dashboard grouping bucket'
        AFTER db_type;

-- Categorise existing items. Order matters: the first matching WHEN wins, so more
-- specific buckets are tested before the broader ones — 'Refunds Without Approval'
-- must land under Cancel / Refund rather than under a generic payment bucket.
UPDATE monitoring_queries
SET category = CASE
    WHEN title LIKE '%Marketplace%'                                  THEN 'Marketplace'
    WHEN title LIKE '%ESP%'                                          THEN 'ESP'
    WHEN title LIKE '%TPA%'                                          THEN 'TPA'
    WHEN title LIKE '%Registration%' OR title LIKE '%Membership%'
         OR title LIKE '%Account%'                                   THEN 'Membership'
    WHEN title LIKE '%Refund%' OR title LIKE '%Cancel%'              THEN 'Cancel / Refund'
    WHEN title LIKE '%Payment%' OR title LIKE '%Transaction%'
         OR title LIKE '%Settlement%'                                THEN 'PG / Payment'
    WHEN title LIKE '%Reward%' OR title LIKE '%Points%'              THEN 'Reward'
    WHEN title LIKE '%BOPIS%' OR title LIKE '%Pickup%'               THEN 'BOPIS'
    WHEN title LIKE '%Unfulfilled%' OR title LIKE '%Delivery%'
         OR title LIKE '%Shipment%'                                  THEN 'Order Delivery'
    WHEN title LIKE '%Duplicate%' OR title LIKE '%Validation%'       THEN 'Order Validation'
    WHEN title LIKE '%Revenue%' OR title LIKE '%Export%'
         OR title LIKE '%Summary%'                                   THEN 'Export & ERP I/F'
    WHEN title LIKE '%Session%' OR title LIKE '%Stale%'
         OR title LIKE '%Interface%'                                 THEN 'Interface Health'
    WHEN title LIKE '%Inventory%' OR title LIKE '%Reorder%'          THEN 'Service'
    ELSE 'Other'
END;
