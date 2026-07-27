package com.lg.microservice.msor.monitoring.common.security;

import com.lg.microservice.msor.monitoring.model.enums.AppRole;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.util.StringUtils;

import java.util.LinkedHashSet;
import java.util.Set;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final AppJwtDecoder appJwtDecoder;
    private final AppJwtConverter appJwtConverter;
    private final AuthProviderProperties authProviderProperties;

    @Value("${auth.enabled:true}")
    private boolean authEnabled;

    @Bean
    @SuppressWarnings("java:S4502") // stateless JWT resource server — CSRF not applicable
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable());

        if (!authEnabled) {
            http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
            return http.build();
        }

        http
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v1/auth/**").permitAll()
                        .requestMatchers("/v1/openapi/**").permitAll()
                        .requestMatchers("/swagger-ui/**").permitAll()
                        .requestMatchers("/v1/flyway/**").permitAll()
                        .requestMatchers("/v1/admin/**").hasAnyRole(adminRoles())
                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt
                                .decoder(appJwtDecoder)
                                .jwtAuthenticationConverter(appJwtConverter)
                        )
                )
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                );

        return http.build();
    }

    /**
     * Admin access is granted by the app-managed {@link AppRole#ADMIN} role and, until the Cognito
     * role source is retired, by membership in the legacy Cognito admin group. Accepting both is what
     * lets phase 1 ship without a cutover: an admin defined either way gets in, and dropping the
     * group later takes nobody's access away.
     */
    private String[] adminRoles() {
        Set<String> roles = new LinkedHashSet<>();
        roles.add(AppRole.ADMIN.name());
        String legacyGroup = authProviderProperties.getAdminGroup();
        if (StringUtils.hasText(legacyGroup)) {
            roles.add(legacyGroup);
        }
        return roles.toArray(String[]::new);
    }
}
