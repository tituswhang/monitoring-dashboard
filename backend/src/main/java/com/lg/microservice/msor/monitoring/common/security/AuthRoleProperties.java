package com.lg.microservice.msor.monitoring.common.security;

import com.lg.microservice.msor.monitoring.model.enums.AppRole;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

/**
 * Authorization config, deliberately separate from {@link AuthProviderProperties}: roles are the one
 * thing about auth that is <em>not</em> the identity provider's business, and the config tree should
 * say so. Nothing here mentions Cognito except {@link RoleSource#COGNITO}, which exists only to be
 * deleted.
 */
@Getter
@Setter
@Configuration
@ConfigurationProperties(prefix = "auth.roles")
public class AuthRoleProperties {

    private RoleSource source = RoleSource.BOTH;

    /** What a user with no roles granted falls back to. Signing in should never mean a blank app. */
    private AppRole defaultRole = AppRole.VIEWER;

    /** The role handed out when {@code auth.enabled=false}, so local/demo runs still see everything. */
    private AppRole demoRole = AppRole.ADMIN;

    /**
     * Emails that always resolve to {@code ADMIN}, whatever the database says. This is how the first
     * admin exists before anyone can grant anything, and the way back in if the last admin row is
     * ever deleted. Keep it populated in every environment.
     */
    private List<String> bootstrapAdmins = new ArrayList<>();
}
