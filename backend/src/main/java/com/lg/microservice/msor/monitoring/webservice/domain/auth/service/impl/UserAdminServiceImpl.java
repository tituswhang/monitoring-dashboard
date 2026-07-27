package com.lg.microservice.msor.monitoring.webservice.domain.auth.service.impl;

import com.lg.microservice.msor.monitoring.common.exception.EntityNotFoundException;
import com.lg.microservice.msor.monitoring.common.exception.RoleAssignmentException;
import com.lg.microservice.msor.monitoring.common.security.AuthRoleProperties;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.common.security.RoleResolver;
import com.lg.microservice.msor.monitoring.constant.AppTime;
import com.lg.microservice.msor.monitoring.model.entity.AppUser;
import com.lg.microservice.msor.monitoring.model.entity.AppUserRole;
import com.lg.microservice.msor.monitoring.model.enums.AppRole;
import com.lg.microservice.msor.monitoring.model.request.InviteUserRequest;
import com.lg.microservice.msor.monitoring.model.response.AppUserResponse;
import com.lg.microservice.msor.monitoring.model.response.InviteUserResponse;
import com.lg.microservice.msor.monitoring.props.AppProperties;
import com.lg.microservice.msor.monitoring.repository.AppUserRepository;
import com.lg.microservice.msor.monitoring.repository.AppUserRoleRepository;
import com.lg.microservice.msor.monitoring.webservice.domain.auth.service.UserAdminService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserAdminServiceImpl implements UserAdminService {

    /** How stale a recorded sign-in must be before /v1/auth/me writes it again. */
    private static final Duration SIGN_IN_WRITE_INTERVAL = Duration.ofMinutes(10);

    private final AppUserRepository appUserRepository;
    private final AppUserRoleRepository appUserRoleRepository;
    private final AuthRoleProperties roleProperties;
    private final AppProperties appProperties;
    private final RoleResolver roleResolver;

    @Override
    @Transactional(readOnly = true)
    public List<AppUserResponse> listUsers() {
        Map<Long, List<String>> rolesByUser = new LinkedHashMap<>();
        for (AppUserRole grant : appUserRoleRepository.findAllWithUser()) {
            rolesByUser.computeIfAbsent(grant.getUser().getId(), id -> new ArrayList<>()).add(grant.getRole());
        }

        List<AppUserResponse> users = new ArrayList<>();
        for (AppUser user : appUserRepository.findAllByOrderByEmailAsc()) {
            List<String> roles = rolesByUser.getOrDefault(user.getId(), List.of());
            users.add(toResponse(user, roles, isBootstrapAdmin(user.getEmail())));
        }

        users.addAll(unlistedBootstrapAdmins(users));
        return users;
    }

    @Override
    @Transactional
    public InviteUserResponse invite(InviteUserRequest request, AuthenticatedUser actor) {
        String email = normalize(request.getEmail());
        Optional<AppUser> existing = appUserRepository.findByEmail(email);

        AppUser user = existing.orElseGet(() -> AppUser.builder()
                .email(email)
                .active(true)
                .createdAt(LocalDateTime.now(AppTime.APP_ZONE))
                .createdBy(actorEmail(actor))
                .build());
        user.setActive(true);
        if (StringUtils.hasText(request.getName())) {
            user.setName(request.getName().trim());
        }
        appUserRepository.save(user);

        Set<AppRole> roles = parseRoles(request.getRoles());
        writeRoles(user, roles, actor);
        invalidateAfterCommit(email);
        log.info("'{}' invited '{}' with roles {}", actorEmail(actor), email, roles);

        return new InviteUserResponse(email, names(roles), appProperties.getDashboardUrl(), existing.isPresent());
    }

    @Override
    @Transactional
    public void recordSignIn(AuthenticatedUser user, String subject) {
        if (user == null || !StringUtils.hasText(user.email())) {
            return;
        }
        String email = normalize(user.email());
        LocalDateTime now = LocalDateTime.now(AppTime.APP_ZONE);

        Optional<AppUser> existing = appUserRepository.findByEmail(email);
        if (existing.isEmpty()) {
            // Signed up without an invite. They hold no roles and so resolve to the default one; the
            // row exists purely so an admin can see them and grant them something.
            appUserRepository.save(AppUser.builder()
                    .email(email)
                    .name(user.name())
                    .externalSubject(subject)
                    .active(true)
                    .createdAt(now)
                    .createdBy("self-signup")
                    .lastLoginAt(now)
                    .build());
            log.info("First sign-in by '{}', who was never invited; recorded with no roles", email);
            return;
        }

        // /v1/auth/me is hit on every page load, so throttle the write: the column exists to answer
        // "has this person ever arrived?", not to be an access log.
        AppUser found = existing.get();
        if (found.getLastLoginAt() != null && found.getLastLoginAt().isAfter(now.minus(SIGN_IN_WRITE_INTERVAL))) {
            return;
        }
        found.setLastLoginAt(now);
        found.setExternalSubject(subject);
        if (!StringUtils.hasText(found.getName()) && StringUtils.hasText(user.name())) {
            found.setName(user.name());
        }
        appUserRepository.save(found);
    }

    @Override
    @Transactional
    public AppUserResponse replaceRoles(String email, List<String> roleNames, AuthenticatedUser actor) {
        String key = normalize(email);

        // Before the lookup, not after: a bootstrap admin may have no row at all, and "no such user"
        // is a baffling answer to "why can't I edit this person the admin table just showed me?".
        if (isBootstrapAdmin(key)) {
            throw new RoleAssignmentException(
                    email + " is an admin by configuration (AUTH_BOOTSTRAP_ADMINS) and cannot be edited here.");
        }

        AppUser user = requireUser(key);
        Set<AppRole> roles = parseRoles(roleNames);
        if (roles.isEmpty()) {
            throw new RoleAssignmentException(
                    "No recognised role in " + roleNames + ". Deactivate the user instead of leaving them with none.");
        }

        guardAdminLoss(user, roles.contains(AppRole.ADMIN), actor, "change the roles of");
        writeRoles(user, roles, actor);
        invalidateAfterCommit(key);
        log.info("'{}' set roles of '{}' to {}", actorEmail(actor), key, roles);

        return toResponse(user, names(roles), false);
    }

    @Override
    @Transactional
    public void deactivate(String email, AuthenticatedUser actor) {
        String key = normalize(email);
        if (isBootstrapAdmin(key)) {
            throw new RoleAssignmentException(
                    email + " is an admin by configuration (AUTH_BOOTSTRAP_ADMINS) and cannot be deactivated here.");
        }

        AppUser user = requireUser(key);
        guardAdminLoss(user, false, actor, "deactivate");
        user.setActive(false);
        appUserRepository.save(user);
        invalidateAfterCommit(key);
        log.info("'{}' deactivated '{}'", actorEmail(actor), key);
    }

    /**
     * Refuses the two changes that can lock admins out of their own app: an admin demoting themselves
     * (nearly always a misclick — and if it is not, another admin can do it for them), and removing
     * the only admin left.
     *
     * <p>Bootstrap admins are deliberately not counted as a substitute here. They are the recovery
     * path, not a licence to leave the app with no admin of record.
     */
    private void guardAdminLoss(AppUser user, boolean staysAdmin, AuthenticatedUser actor, String verb) {
        boolean isAdmin = appUserRoleRepository.findRoleNamesByEmail(user.getEmail()).stream()
                .map(AppRole::parse)
                .flatMap(Optional::stream)
                .anyMatch(role -> role == AppRole.ADMIN);
        if (!isAdmin || staysAdmin) {
            return;
        }

        if (user.getEmail().equals(normalizeOrNull(actorEmail(actor)))) {
            throw new RoleAssignmentException("You cannot " + verb + " your own admin access.");
        }
        if (appUserRoleRepository.countActiveHolders(AppRole.ADMIN.name()) <= 1) {
            throw new RoleAssignmentException(
                    "Cannot " + verb + " the last admin. Grant admin to someone else first.");
        }
    }

    /** Replaces the user's grants wholesale — the request states the end state, not a delta. */
    private void writeRoles(AppUser user, Set<AppRole> roles, AuthenticatedUser actor) {
        appUserRoleRepository.deleteByUserId(user.getId());
        appUserRoleRepository.flush();
        for (AppRole role : roles) {
            appUserRoleRepository.save(AppUserRole.builder()
                    .user(user)
                    .role(role.name())
                    .grantedAt(LocalDateTime.now(AppTime.APP_ZONE))
                    .grantedBy(actorEmail(actor))
                    .build());
        }
    }

    /**
     * Bootstrap admins configured against an email with no row. They hold admin regardless, so the
     * admin table must show them rather than quietly leave them out.
     */
    private List<AppUserResponse> unlistedBootstrapAdmins(List<AppUserResponse> listed) {
        Set<String> known = new HashSet<>();
        listed.forEach(user -> known.add(user.email()));
        return roleProperties.getBootstrapAdmins().stream()
                .filter(StringUtils::hasText)
                .map(UserAdminServiceImpl::normalize)
                .distinct()
                .filter(email -> !known.contains(email))
                .map(email -> new AppUserResponse(
                        email, null, List.of(AppRole.ADMIN.name()), true, true, null, null))
                .toList();
    }

    private AppUser requireUser(String email) {
        return appUserRepository.findByEmail(email)
                .orElseThrow(() -> new EntityNotFoundException("No such user: " + email));
    }

    private boolean isBootstrapAdmin(String email) {
        return roleProperties.getBootstrapAdmins().stream()
                .filter(StringUtils::hasText)
                .map(UserAdminServiceImpl::normalize)
                .anyMatch(email::equals);
    }

    /** Empty means the configured default, so that an invite always leaves a role of record. */
    private Set<AppRole> parseRoles(List<String> roleNames) {
        if (CollectionUtils.isEmpty(roleNames)) {
            return EnumSet.of(Optional.ofNullable(roleProperties.getDefaultRole()).orElse(AppRole.VIEWER));
        }
        Set<AppRole> roles = EnumSet.noneOf(AppRole.class);
        roleNames.stream()
                .map(AppRole::parse)
                .flatMap(Optional::stream)
                .forEach(roles::add);
        return roles;
    }

    /**
     * Drops the cache only once the change is durable. Invalidating inside the transaction would let a
     * concurrent request re-cache the pre-commit roles and hold them for the full TTL.
     */
    private void invalidateAfterCommit(String email) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            roleResolver.invalidate(email);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                roleResolver.invalidate(email);
            }
        });
    }

    private static AppUserResponse toResponse(AppUser user, List<String> roles, boolean bootstrapAdmin) {
        List<String> effective = bootstrapAdmin && !roles.contains(AppRole.ADMIN.name())
                ? sorted(concat(roles, AppRole.ADMIN.name()))
                : sorted(roles);
        return new AppUserResponse(user.getEmail(), user.getName(), effective, user.isActive(),
                bootstrapAdmin, user.getCreatedAt(), user.getLastLoginAt());
    }

    private static List<String> concat(List<String> roles, String extra) {
        List<String> all = new ArrayList<>(roles);
        all.add(extra);
        return all;
    }

    private static List<String> sorted(List<String> roles) {
        return roles.stream().sorted().toList();
    }

    private static List<String> names(Set<AppRole> roles) {
        return roles.stream().map(AppRole::name).sorted(Comparator.naturalOrder()).toList();
    }

    private static String actorEmail(AuthenticatedUser actor) {
        return actor == null ? null : actor.email();
    }

    private static String normalizeOrNull(String email) {
        return StringUtils.hasText(email) ? normalize(email) : null;
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
