package com.lg.microservice.msor.monitoring.model.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
public class InviteUserRequest {

    /** Email address of the person to invite. Becomes both their login and their identity here. */
    @NotBlank
    @Email
    private String email;

    /** Optional display name set as the {@code name} attribute on the new login. */
    private String name;

    /**
     * Roles to grant, e.g. {@code ["EDITOR"]}. These are written to this application's tables — they
     * are no longer Cognito groups, which is the point: an admin can change them later from the
     * dashboard without touching AWS. Empty means the configured default role.
     */
    private List<String> roles;
}
