package com.lg.microservice.msor.monitoring.model.response;

import java.util.List;

/**
 * Who the caller is and what they may do, as the frontend should ask rather than infer.
 *
 * <p>The UI used to decode the access token and read {@code cognito:groups} out of it to decide
 * whether to show admin controls. That only ever worked because roles happened to live in the token;
 * now they do not. This endpoint is the single answer, and it is derived from the authorities the
 * filter chain actually enforces — so the UI cannot disagree with the server about what is allowed.
 *
 * @param roles role names, e.g. {@code ["EDITOR"]}
 * @param permissions the union of those roles' permissions, for gating individual controls
 */
public record CurrentUserResponse(String name, String email, List<String> roles, List<String> permissions) {
}
