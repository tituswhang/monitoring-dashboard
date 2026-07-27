package com.lg.microservice.msor.monitoring.webservice.domain.auth.service.impl;

import com.lg.microservice.msor.monitoring.common.exception.EntityNotFoundException;
import com.lg.microservice.msor.monitoring.common.exception.RoleAssignmentException;
import com.lg.microservice.msor.monitoring.common.security.AuthRoleProperties;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.common.security.RoleResolver;
import com.lg.microservice.msor.monitoring.constant.AppTime;
import com.lg.microservice.msor.monitoring.model.entity.AppUser;
import com.lg.microservice.msor.monitoring.model.enums.AppRole;
import com.lg.microservice.msor.monitoring.model.request.InviteUserRequest;
import com.lg.microservice.msor.monitoring.model.response.AppUserResponse;
import com.lg.microservice.msor.monitoring.model.response.InviteUserResponse;
import com.lg.microservice.msor.monitoring.props.AppProperties;
import com.lg.microservice.msor.monitoring.repository.AppUserRepository;
import com.lg.microservice.msor.monitoring.repository.AppUserRoleRepository;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class UserAdminServiceImplTest {

    private static final String ADMIN_EMAIL = "boss@example.com";
    private static final String TARGET_EMAIL = "worker@example.com";
    private static final String DASHBOARD_URL = "https://dashboard.example.com/";
    private static final AuthenticatedUser ACTOR = new AuthenticatedUser("The Boss", ADMIN_EMAIL);

    @Mock
    private AppUserRepository appUserRepository;

    @Mock
    private AppUserRoleRepository appUserRoleRepository;

    @Mock
    private RoleResolver roleResolver;

    private AuthRoleProperties properties;
    private UserAdminServiceImpl service;

    @BeforeEach
    void setUp() {
        properties = new AuthRoleProperties();
        AppProperties appProperties = new AppProperties();
        appProperties.setDashboardUrl(DASHBOARD_URL);
        service = new UserAdminServiceImpl(
                appUserRepository, appUserRoleRepository, properties, appProperties, roleResolver);
    }

    private static AppUser user(String email) {
        return AppUser.builder().id(7L).email(email).name("Worker").active(true).build();
    }

    private void existing(String email, String... roles) {
        doReturn(Optional.of(user(email))).when(appUserRepository).findByEmail(email);
        lenient().doReturn(List.of(roles)).when(appUserRoleRepository).findRoleNamesByEmail(email);
    }

    @Test
    void replaceRoles_writesTheFullSetAndDropsTheCache() {
        existing(TARGET_EMAIL, "VIEWER");

        AppUserResponse updated = service.replaceRoles(TARGET_EMAIL, List.of("EDITOR"), ACTOR);

        Assertions.assertEquals(List.of("EDITOR"), updated.roles());
        verify(appUserRoleRepository).deleteByUserId(7L);
        verify(appUserRoleRepository, times(1)).save(any());
        verify(roleResolver).invalidate(TARGET_EMAIL);
    }

    @Test
    void replaceRoles_mixedCaseEmail_resolvesToTheSameUser() {
        existing(TARGET_EMAIL, "VIEWER");

        service.replaceRoles("  Worker@EXAMPLE.com ", List.of("editor"), ACTOR);

        verify(appUserRepository).findByEmail(TARGET_EMAIL);
    }

    @Test
    void replaceRoles_unknownUser_is404() {
        doReturn(Optional.empty()).when(appUserRepository).findByEmail(TARGET_EMAIL);

        Assertions.assertThrows(EntityNotFoundException.class,
                () -> service.replaceRoles(TARGET_EMAIL, List.of("EDITOR"), ACTOR));
    }

    @Test
    void replaceRoles_noRecognisedRole_isRefused() {
        existing(TARGET_EMAIL, "VIEWER");

        RoleAssignmentException e = Assertions.assertThrows(RoleAssignmentException.class,
                () -> service.replaceRoles(TARGET_EMAIL, List.of("wizard"), ACTOR));

        Assertions.assertTrue(e.getMessage().contains("Deactivate the user instead"));
        verify(appUserRoleRepository, never()).deleteByUserId(any());
    }

    /** A misclick must not be able to lock the person doing the clicking out of their own app. */
    @Test
    void replaceRoles_adminDemotingThemselves_isRefused() {
        existing(ADMIN_EMAIL, "ADMIN");

        RoleAssignmentException e = Assertions.assertThrows(RoleAssignmentException.class,
                () -> service.replaceRoles(ADMIN_EMAIL, List.of("EDITOR"), ACTOR));

        Assertions.assertTrue(e.getMessage().contains("your own admin access"));
        verify(appUserRoleRepository, never()).deleteByUserId(any());
    }

    @Test
    void replaceRoles_removingTheLastAdmin_isRefused() {
        existing(TARGET_EMAIL, "ADMIN");
        doReturn(1L).when(appUserRoleRepository).countActiveHolders("ADMIN");

        RoleAssignmentException e = Assertions.assertThrows(RoleAssignmentException.class,
                () -> service.replaceRoles(TARGET_EMAIL, List.of("EDITOR"), ACTOR));

        Assertions.assertTrue(e.getMessage().contains("last admin"));
    }

    @Test
    void replaceRoles_demotingAnAdminWhenOthersRemain_isAllowed() {
        existing(TARGET_EMAIL, "ADMIN");
        doReturn(2L).when(appUserRoleRepository).countActiveHolders("ADMIN");

        AppUserResponse updated = service.replaceRoles(TARGET_EMAIL, List.of("EDITOR"), ACTOR);

        Assertions.assertEquals(List.of("EDITOR"), updated.roles());
    }

    @Test
    void replaceRoles_adminKeepingAdmin_skipsTheGuardEntirely() {
        existing(ADMIN_EMAIL, "ADMIN");

        AppUserResponse updated = service.replaceRoles(ADMIN_EMAIL, List.of("ADMIN", "EDITOR"), ACTOR);

        Assertions.assertEquals(List.of("ADMIN", "EDITOR"), updated.roles());
        verify(appUserRoleRepository, never()).countActiveHolders(any());
    }

    @Test
    void replaceRoles_bootstrapAdmin_cannotBeEditedAway() {
        properties.setBootstrapAdmins(List.of(TARGET_EMAIL));

        RoleAssignmentException e = Assertions.assertThrows(RoleAssignmentException.class,
                () -> service.replaceRoles(TARGET_EMAIL, List.of("VIEWER"), ACTOR));

        Assertions.assertTrue(e.getMessage().contains("AUTH_BOOTSTRAP_ADMINS"));
    }

    @Test
    void deactivate_lastAdmin_isRefused() {
        existing(TARGET_EMAIL, "ADMIN");
        doReturn(1L).when(appUserRoleRepository).countActiveHolders("ADMIN");

        Assertions.assertThrows(RoleAssignmentException.class, () -> service.deactivate(TARGET_EMAIL, ACTOR));
        verify(appUserRepository, never()).save(any());
    }

    @Test
    void deactivate_nonAdmin_setsInactiveAndDropsTheCache() {
        existing(TARGET_EMAIL, "EDITOR");

        service.deactivate(TARGET_EMAIL, ACTOR);

        ArgumentCaptor<AppUser> saved = ArgumentCaptor.forClass(AppUser.class);
        verify(appUserRepository).save(saved.capture());
        Assertions.assertFalse(saved.getValue().isActive());
        verify(roleResolver).invalidate(TARGET_EMAIL);
    }

    /** The point of the rewrite: inviting somebody creates no account anywhere and calls no AWS API. */
    @Test
    void invite_grantsRolesAheadOfTheAccountAndReturnsTheLink() {
        doReturn(Optional.empty()).when(appUserRepository).findByEmail(TARGET_EMAIL);
        doReturn(user(TARGET_EMAIL)).when(appUserRepository).save(any());

        InviteUserRequest request = new InviteUserRequest();
        request.setEmail("  Worker@EXAMPLE.com ");
        request.setName("Worker");
        request.setRoles(List.of("EDITOR"));

        InviteUserResponse response = service.invite(request, ACTOR);

        Assertions.assertEquals(TARGET_EMAIL, response.email());
        Assertions.assertEquals(List.of("EDITOR"), response.roles());
        Assertions.assertEquals(DASHBOARD_URL, response.inviteUrl());
        Assertions.assertFalse(response.alreadyInvited());
        verify(roleResolver).invalidate(TARGET_EMAIL);
    }

    @Test
    void invite_existingUser_resetsRolesAndSaysSo() {
        existing(TARGET_EMAIL, "VIEWER");
        doReturn(user(TARGET_EMAIL)).when(appUserRepository).save(any());

        InviteUserRequest request = new InviteUserRequest();
        request.setEmail(TARGET_EMAIL);
        request.setRoles(List.of("ADMIN"));

        InviteUserResponse response = service.invite(request, ACTOR);

        Assertions.assertTrue(response.alreadyInvited());
        Assertions.assertEquals(List.of("ADMIN"), response.roles());
    }

    @Test
    void invite_withNoRoles_grantsTheDefaultRole() {
        doReturn(Optional.empty()).when(appUserRepository).findByEmail(TARGET_EMAIL);
        doReturn(user(TARGET_EMAIL)).when(appUserRepository).save(any());

        InviteUserRequest request = new InviteUserRequest();
        request.setEmail(TARGET_EMAIL);

        Assertions.assertEquals(List.of(AppRole.VIEWER.name()), service.invite(request, ACTOR).roles());
    }

    @Test
    void recordSignIn_invitedUserArriving_stampsTheirFirstLogin() {
        AppUser invited = user(TARGET_EMAIL);
        invited.setLastLoginAt(null);
        doReturn(Optional.of(invited)).when(appUserRepository).findByEmail(TARGET_EMAIL);

        service.recordSignIn(new AuthenticatedUser("Wendy Worker", TARGET_EMAIL), "uuid-1");

        ArgumentCaptor<AppUser> saved = ArgumentCaptor.forClass(AppUser.class);
        verify(appUserRepository).save(saved.capture());
        Assertions.assertNotNull(saved.getValue().getLastLoginAt());
        Assertions.assertEquals("uuid-1", saved.getValue().getExternalSubject());
    }

    /** /v1/auth/me runs on every page load; the column answers "have they ever arrived?", not "when last?". */
    @Test
    void recordSignIn_alreadyStampedRecently_doesNotWriteAgain() {
        AppUser seen = user(TARGET_EMAIL);
        seen.setLastLoginAt(LocalDateTime.now(AppTime.APP_ZONE).minusMinutes(2));
        doReturn(Optional.of(seen)).when(appUserRepository).findByEmail(TARGET_EMAIL);

        service.recordSignIn(new AuthenticatedUser("Wendy Worker", TARGET_EMAIL), "uuid-1");

        verify(appUserRepository, never()).save(any());
    }

    @Test
    void recordSignIn_selfSignupWithNoInvite_isRecordedWithNoRoles() {
        doReturn(Optional.empty()).when(appUserRepository).findByEmail("stranger@example.com");

        service.recordSignIn(new AuthenticatedUser("A Stranger", "Stranger@EXAMPLE.com"), "uuid-9");

        ArgumentCaptor<AppUser> saved = ArgumentCaptor.forClass(AppUser.class);
        verify(appUserRepository).save(saved.capture());
        Assertions.assertEquals("stranger@example.com", saved.getValue().getEmail());
        Assertions.assertNotNull(saved.getValue().getLastLoginAt());
        verify(appUserRoleRepository, never()).save(any());
    }

    @Test
    void recordSignIn_unidentifiableCaller_isIgnored() {
        service.recordSignIn(AuthenticatedUser.anonymous(), "uuid-1");
        service.recordSignIn(null, "uuid-1");

        verify(appUserRepository, never()).save(any());
    }

    @Test
    void listUsers_includesBootstrapAdminsThatHaveNoRow() {
        properties.setBootstrapAdmins(List.of("Founder@EXAMPLE.com"));
        doReturn(List.of()).when(appUserRoleRepository).findAllWithUser();
        doReturn(List.of(user(TARGET_EMAIL))).when(appUserRepository).findAllByOrderByEmailAsc();

        List<AppUserResponse> users = service.listUsers();

        Assertions.assertEquals(2, users.size());
        AppUserResponse founder = users.get(1);
        Assertions.assertEquals("founder@example.com", founder.email());
        Assertions.assertTrue(founder.bootstrapAdmin());
        Assertions.assertEquals(List.of("ADMIN"), founder.roles());
    }
}
