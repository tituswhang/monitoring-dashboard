package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.impl;

import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.model.response.AuthorBackfillResponse;
import com.lg.microservice.msor.monitoring.repository.MonitoringCaseActivityRepository;
import com.lg.microservice.msor.monitoring.webservice.domain.auth.service.CognitoUserAdminService;
import com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.CaseActivityAuthorBackfillService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * One-off repair for comments and status changes authored before the author resolution fix: their
 * {@code author_email} holds the Cognito subject UUID from the token rather than the user's email,
 * so the timeline renders a UUID where a name belongs.
 *
 * <p>The mapping from subject to identity lives only in Cognito, so this cannot be a SQL migration.
 * Each distinct subject is resolved once via {@code AdminGetUser} and every entry it authored is
 * rewritten. Subjects Cognito cannot identify — users since deleted from the pool — are reported and
 * left untouched, on the grounds that a stale UUID is more recoverable than a destroyed attribution.
 *
 * <p>Each subject commits on its own (the repository's update is transactional), so a failure part
 * way through keeps the work already done. Re-running resumes: rewritten rows no longer match.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CaseActivityAuthorBackfillServiceImpl implements CaseActivityAuthorBackfillService {

    private final MonitoringCaseActivityRepository activityRepository;
    private final CognitoUserAdminService cognitoUserAdminService;

    @Override
    public AuthorBackfillResponse backfillAuthors(boolean dryRun) {
        List<String> subjects = activityRepository.findOpaqueAuthorIdentifiers();
        List<String> unresolved = new ArrayList<>();
        int resolved = 0;
        long rowsAffected = 0;

        for (String subject : subjects) {
            Optional<AuthenticatedUser> user = cognitoUserAdminService.findBySubject(subject);
            if (user.isEmpty()) {
                unresolved.add(subject);
                continue;
            }

            resolved++;
            AuthenticatedUser author = user.get();
            rowsAffected += dryRun
                    ? activityRepository.countByAuthorEmail(subject)
                    : activityRepository.replaceAuthor(subject, author.name(), author.email());
        }

        log.info("Author backfill{}: {} distinct subjects, {} resolved, {} unresolved, {} entries {}",
                dryRun ? " (dry run)" : "", subjects.size(), resolved, unresolved.size(), rowsAffected,
                dryRun ? "would be rewritten" : "rewritten");
        return new AuthorBackfillResponse(dryRun, subjects.size(), resolved, rowsAffected, unresolved);
    }
}
