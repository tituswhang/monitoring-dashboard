package com.lg.microservice.msor.monitoring.model.request;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

/**
 * Replaces a user's entire role set — not a delta. An admin editing roles in the UI is looking at the
 * full set and saying "this is what it should be"; sending that whole set means two admins editing at
 * once cannot merge into a state neither of them chose.
 */
@Data
public class UserRoleUpdateRequest {

    /** Role names, e.g. {@code ["EDITOR"]}. Must be non-empty: use deactivation to remove access. */
    @NotEmpty
    private List<String> roles;
}
