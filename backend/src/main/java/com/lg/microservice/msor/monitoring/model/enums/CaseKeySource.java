package com.lg.microservice.msor.monitoring.model.enums;

/**
 * Which strategy produced a row's {@code case_key}, in the resolution priority order of
 * {@code CaseKeyResolver}.
 *
 * <p>Only {@link #ROW_HASH} is unstable: it hashes the entire {@code row_data}, so any change
 * to any field mints a new key and the case reads as brand new on the next run. Surfaces that
 * age a case by its first sighting must therefore exclude {@code ROW_HASH} rows — their
 * first-seen date is always "today" and means nothing.</p>
 */
public enum CaseKeySource {

    /** The order number. Stable. */
    INCREMENT_ID,

    /** The item's configured {@code identity_columns}. Stable. */
    IDENTITY_COLUMNS,

    /** Heuristic {@code order_id} / {@code entity_id} internal key. Stable. */
    ORDER_ID,

    /** Hash of the full {@code row_data}. <strong>Not stable across runs.</strong> */
    ROW_HASH
}
