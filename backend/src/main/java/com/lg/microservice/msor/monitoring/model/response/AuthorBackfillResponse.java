package com.lg.microservice.msor.monitoring.model.response;

import java.util.List;

/**
 * Outcome of rewriting activity entries that were attributed to a Cognito subject UUID.
 *
 * @param dryRun            when true, nothing was written and {@code rowsAffected} is what a real run would change
 * @param distinctAuthors   how many distinct subject UUIDs were found in the timeline
 * @param resolved          how many of those Cognito could identify
 * @param rowsAffected      entries rewritten (or, on a dry run, that would be)
 * @param unresolvedSubjects subjects Cognito could not identify — deleted users, left untouched
 */
public record AuthorBackfillResponse(
        boolean dryRun,
        int distinctAuthors,
        int resolved,
        long rowsAffected,
        List<String> unresolvedSubjects) {
}
