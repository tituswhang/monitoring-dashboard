package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.impl;

import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.model.response.AuthorBackfillResponse;
import com.lg.microservice.msor.monitoring.repository.MonitoringCaseActivityRepository;
import com.lg.microservice.msor.monitoring.webservice.domain.auth.service.CognitoUserAdminService;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest(classes = CaseActivityAuthorBackfillServiceImplTest.class)
class CaseActivityAuthorBackfillServiceImplTest {

    private static final String SUBJECT = "2458e4a8-6071-70c5-2cec-d27265644244";
    private static final String OTHER_SUBJECT = "9c1f0b3d-1111-2222-3333-444455556666";

    @Mock
    private MonitoringCaseActivityRepository activityRepository;

    @Mock
    private CognitoUserAdminService cognitoUserAdminService;

    @InjectMocks
    private CaseActivityAuthorBackfillServiceImpl backfillService;

    @Test
    void backfillAuthors_resolvesSubject_rewritesItsEntries() {
        doReturn(List.of(SUBJECT)).when(activityRepository).findOpaqueAuthorIdentifiers();
        doReturn(Optional.of(new AuthenticatedUser("Demo User", "demo.user@example.com")))
                .when(cognitoUserAdminService).findBySubject(SUBJECT);
        doReturn(3).when(activityRepository).replaceAuthor(SUBJECT, "Demo User", "demo.user@example.com");

        AuthorBackfillResponse response = backfillService.backfillAuthors(false);

        Assertions.assertFalse(response.dryRun());
        Assertions.assertEquals(1, response.distinctAuthors());
        Assertions.assertEquals(1, response.resolved());
        Assertions.assertEquals(3L, response.rowsAffected());
        Assertions.assertTrue(response.unresolvedSubjects().isEmpty());
    }

    @Test
    void backfillAuthors_dryRun_countsWithoutWriting() {
        doReturn(List.of(SUBJECT)).when(activityRepository).findOpaqueAuthorIdentifiers();
        doReturn(Optional.of(new AuthenticatedUser("Demo User", "demo.user@example.com")))
                .when(cognitoUserAdminService).findBySubject(SUBJECT);
        doReturn(3L).when(activityRepository).countByAuthorEmail(SUBJECT);

        AuthorBackfillResponse response = backfillService.backfillAuthors(true);

        Assertions.assertTrue(response.dryRun());
        Assertions.assertEquals(3L, response.rowsAffected());
        verify(activityRepository, never()).replaceAuthor(anyString(), any(), any());
    }

    @Test
    void backfillAuthors_deletedUser_isReportedAndLeftUntouched() {
        doReturn(List.of(SUBJECT, OTHER_SUBJECT)).when(activityRepository).findOpaqueAuthorIdentifiers();
        doReturn(Optional.empty()).when(cognitoUserAdminService).findBySubject(SUBJECT);
        doReturn(Optional.of(new AuthenticatedUser(null, "someone@example.com")))
                .when(cognitoUserAdminService).findBySubject(OTHER_SUBJECT);
        doReturn(1).when(activityRepository).replaceAuthor(OTHER_SUBJECT, null, "someone@example.com");

        AuthorBackfillResponse response = backfillService.backfillAuthors(false);

        Assertions.assertEquals(2, response.distinctAuthors());
        Assertions.assertEquals(1, response.resolved());
        Assertions.assertEquals(List.of(SUBJECT), response.unresolvedSubjects());
        Assertions.assertEquals(1L, response.rowsAffected());
        verify(activityRepository, never()).replaceAuthor(eq(SUBJECT), any(), any());
    }

    @Test
    void backfillAuthors_nothingToRepair_isANoOp() {
        doReturn(List.of()).when(activityRepository).findOpaqueAuthorIdentifiers();

        AuthorBackfillResponse response = backfillService.backfillAuthors(false);

        Assertions.assertEquals(0, response.distinctAuthors());
        Assertions.assertEquals(0L, response.rowsAffected());
        verify(cognitoUserAdminService, never()).findBySubject(anyString());
        verify(activityRepository, never()).replaceAuthor(anyString(), any(), any());
    }

    @Test
    void backfillAuthors_resolvesEachSubjectOnce() {
        doReturn(List.of(SUBJECT, OTHER_SUBJECT)).when(activityRepository).findOpaqueAuthorIdentifiers();
        doReturn(Optional.of(new AuthenticatedUser("Demo User", "demo.user@example.com")))
                .when(cognitoUserAdminService).findBySubject(anyString());

        backfillService.backfillAuthors(true);

        verify(cognitoUserAdminService, times(1)).findBySubject(SUBJECT);
        verify(cognitoUserAdminService, times(1)).findBySubject(OTHER_SUBJECT);
    }
}
