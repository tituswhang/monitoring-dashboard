package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service;

import com.lg.microservice.msor.monitoring.model.response.AuthorBackfillResponse;

public interface CaseActivityAuthorBackfillService {

    /**
     * Re-attributes activity entries whose author was recorded as an opaque Cognito subject UUID,
     * resolving each distinct subject to a real name and email. Safe to re-run.
     *
     * @param dryRun when true, resolve and report but write nothing
     */
    AuthorBackfillResponse backfillAuthors(boolean dryRun);
}
