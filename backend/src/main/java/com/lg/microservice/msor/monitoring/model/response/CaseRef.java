package com.lg.microservice.msor.monitoring.model.response;

/**
 * A case's stable identity, and the whole of what the KPI endpoint says about a case.
 *
 * <p>No status travels with it. The client already holds every case row, so it joins on this pair
 * and reads the status from the row — which keeps the row the single source of truth, and keeps a
 * person's pie agreeing with the grid it drills into.
 *
 * @param msorId  the monitoring item the case belongs to
 * @param caseKey the case's SHA-256 identity, stable across runs
 */
public record CaseRef(Integer msorId, String caseKey) {
}
