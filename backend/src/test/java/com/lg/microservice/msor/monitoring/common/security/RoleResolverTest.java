package com.lg.microservice.msor.monitoring.common.security;

import com.lg.microservice.msor.monitoring.model.enums.AppRole;
import com.lg.microservice.msor.monitoring.repository.AppUserRoleRepository;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.QueryTimeoutException;

import java.util.List;
import java.util.Set;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class RoleResolverTest {

    private static final String EMAIL = "demo.user@example.com";

    @Mock
    private AppUserRoleRepository appUserRoleRepository;

    private AuthRoleProperties properties;
    private RoleResolver resolver;

    @BeforeEach
    void setUp() {
        properties = new AuthRoleProperties();
        resolver = new RoleResolver(appUserRoleRepository, properties);
    }

    @Test
    void resolve_grantedRoles_comeFromTheDatabase() {
        doReturn(List.of("EDITOR")).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);

        Assertions.assertEquals(Set.of(AppRole.EDITOR), resolver.resolve(EMAIL));
    }

    @Test
    void resolve_mixedCaseEmail_matchesTheLowerCasedKey() {
        doReturn(List.of("ADMIN")).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);

        Assertions.assertEquals(Set.of(AppRole.ADMIN), resolver.resolve("  Demo.User@EXAMPLE.com "));
    }

    @Test
    void resolve_noRolesGranted_fallsBackToTheDefaultRole() {
        doReturn(List.of()).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);

        Assertions.assertEquals(Set.of(AppRole.VIEWER), resolver.resolve(EMAIL));
    }

    @Test
    void resolve_unknownRoleName_isIgnoredRatherThanFatal() {
        doReturn(List.of("EDITOR", "SOMETHING_A_NEWER_DEPLOY_ADDED")).when(appUserRoleRepository)
                .findRoleNamesByEmail(EMAIL);

        Assertions.assertEquals(Set.of(AppRole.EDITOR), resolver.resolve(EMAIL));
    }

    @Test
    void resolve_noEmail_fallsBackToTheDefaultRoleWithoutQuerying() {
        Assertions.assertEquals(Set.of(AppRole.VIEWER), resolver.resolve(null));
        Assertions.assertEquals(Set.of(AppRole.VIEWER), resolver.resolve(" "));
        verify(appUserRoleRepository, never()).findRoleNamesByEmail(any());
    }

    @Test
    void resolve_bootstrapAdmin_isAdminWithoutAnyRow() {
        properties.setBootstrapAdmins(List.of("  Demo.User@EXAMPLE.com "));

        Assertions.assertEquals(Set.of(AppRole.ADMIN), resolver.resolve(EMAIL));
        verify(appUserRoleRepository, never()).findRoleNamesByEmail(any());
    }

    @Test
    void resolve_databaseUnreachable_degradesToTheDefaultRoleAndRetries() {
        doThrow(new QueryTimeoutException("down")).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);

        Assertions.assertEquals(Set.of(AppRole.VIEWER), resolver.resolve(EMAIL));
        Assertions.assertEquals(Set.of(AppRole.VIEWER), resolver.resolve(EMAIL));

        // The failure must not be cached, or one blip would pin a user to VIEWER for the whole TTL.
        verify(appUserRoleRepository, times(2)).findRoleNamesByEmail(EMAIL);
    }

    @Test
    void resolve_repeatedCalls_hitTheDatabaseOnce() {
        doReturn(List.of("ADMIN")).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);

        resolver.resolve(EMAIL);
        resolver.resolve(EMAIL);

        verify(appUserRoleRepository, times(1)).findRoleNamesByEmail(EMAIL);
    }

    @Test
    void invalidate_makesAGrantTakeEffectImmediately() {
        doReturn(List.of("VIEWER")).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);
        Assertions.assertEquals(Set.of(AppRole.VIEWER), resolver.resolve(EMAIL));

        doReturn(List.of("ADMIN")).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);
        resolver.invalidate("Demo.User@EXAMPLE.com");

        Assertions.assertEquals(Set.of(AppRole.ADMIN), resolver.resolve(EMAIL));
    }
}
