package com.lg.microservice.msor.monitoring.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * An application user, for authorization purposes only — credentials still live in the identity
 * provider. Keyed by lower-cased {@link #email}, which is stable across identity providers in a way
 * a Cognito {@code sub} is not.
 *
 * <p>A row may exist before the person has ever logged in: that is how an admin pre-assigns a role.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "app_user")
public class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "name")
    private String name;

    /** The Cognito subject, recorded for audit. Never used to look a user up. */
    @Column(name = "external_subject")
    private String externalSubject;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;
}
