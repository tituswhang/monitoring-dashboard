package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service;

import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.model.response.CaseWorkloadResponse;

public interface KpiWorkloadService {

    /**
     * Who touched which case during one calendar month.
     *
     * <p>There is no assignee anywhere in the schema, so "the cases Alice is working on" is derived:
     * a person is on a case if they commented on it or changed its status. Overlap is intended — a
     * case two people touched belongs to both.
     *
     * @param month  the month to report, {@code yyyy-MM}; null or blank means the current month in
     *               {@code AppTime.APP_ZONE}, never the JVM default zone
     * @param viewer the caller, used only to flag their own entry
     * @throws IllegalArgumentException when {@code month} is present but not a valid {@code yyyy-MM}
     */
    CaseWorkloadResponse getCaseWorkload(String month, AuthenticatedUser viewer);
}
