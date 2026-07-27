package com.lg.microservice.msor.monitoring.webservice.domain.auth.controller;

import com.lg.microservice.msor.monitoring.common.exception.EntityNotFoundException;
import com.lg.microservice.msor.monitoring.common.exception.RoleAssignmentException;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUserResolver;
import com.lg.microservice.msor.monitoring.model.request.InviteUserRequest;
import com.lg.microservice.msor.monitoring.model.request.UserRoleUpdateRequest;
import com.lg.microservice.msor.monitoring.model.response.AppUserResponse;
import com.lg.microservice.msor.monitoring.model.response.InviteUserResponse;
import com.lg.microservice.msor.monitoring.webservice.domain.auth.service.UserAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * User and role administration. The filter chain guards {@code /v1/admin/**}, so everything here
 * requires admin — held either as the app-managed {@code ADMIN} role or, until the Cognito role
 * source is retired, via the legacy admin group.
 */
@Slf4j
@RestController
@RequestMapping("/v1/admin/users")
@RequiredArgsConstructor
@Tag(name = "Admin - Users", description = "Invite users and assign their roles")
public class AdminUserController {

    private final UserAdminService userAdminService;
    private final AuthenticatedUserResolver authenticatedUserResolver;

    @Operation(summary = "List users and their roles")
    @ApiResponse(responseCode = "200", description = "Success")
    @ApiResponse(responseCode = "403", description = "Caller is not an admin")
    @GetMapping
    public ResponseEntity<List<AppUserResponse>> list() {
        return ResponseEntity.ok(userAdminService.listUsers());
    }

    @Operation(summary = "Invite a user",
            description = "Grants the requested roles to an email ahead of time and returns the dashboard link "
                    + "to send them. Creates no account: the pool allows self-signup, and the waiting roles bind "
                    + "when they first sign in. Touches no AWS service, so it needs no AWS credentials.")
    @ApiResponse(responseCode = "201", description = "Invited")
    @ApiResponse(responseCode = "200", description = "Already known here; roles reset")
    @ApiResponse(responseCode = "400", description = "Invalid request")
    @ApiResponse(responseCode = "403", description = "Caller is not an admin")
    @PostMapping("/invite")
    public ResponseEntity<InviteUserResponse> invite(@Valid @RequestBody InviteUserRequest request,
                                                     Authentication authentication) {
        InviteUserResponse response = userAdminService.invite(request, actor(authentication));
        HttpStatus status = response.alreadyInvited() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(response);
    }

    @Operation(summary = "Replace a user's roles",
            description = "Sends the full role set the user should end up with, not a delta. Refuses to remove "
                    + "the caller's own admin access, or the last admin's.")
    @ApiResponse(responseCode = "200", description = "Roles updated")
    @ApiResponse(responseCode = "400", description = "Invalid request")
    @ApiResponse(responseCode = "403", description = "Caller is not an admin")
    @ApiResponse(responseCode = "404", description = "No such user")
    @ApiResponse(responseCode = "409", description = "Would remove the last admin, or the caller's own")
    @PutMapping("/{email}/roles")
    public ResponseEntity<Object> replaceRoles(@PathVariable String email,
                                               @Valid @RequestBody UserRoleUpdateRequest request,
                                               Authentication authentication) {
        try {
            AppUserResponse updated = userAdminService.replaceRoles(
                    email, request.getRoles(), actor(authentication));
            return ResponseEntity.ok(updated);
        } catch (EntityNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(e.getMessage()));
        } catch (RoleAssignmentException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error(e.getMessage()));
        }
    }

    @Operation(summary = "Deactivate a user",
            description = "They keep their login but hold no roles. Their past activity stays attributed to them, "
                    + "which is why this is not a delete.")
    @ApiResponse(responseCode = "204", description = "User deactivated")
    @ApiResponse(responseCode = "403", description = "Caller is not an admin")
    @ApiResponse(responseCode = "404", description = "No such user")
    @ApiResponse(responseCode = "409", description = "Would deactivate the last admin, or the caller themselves")
    @DeleteMapping("/{email}")
    public ResponseEntity<Object> deactivate(@PathVariable String email, Authentication authentication) {
        try {
            userAdminService.deactivate(email, actor(authentication));
            return ResponseEntity.noContent().build();
        } catch (EntityNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(e.getMessage()));
        } catch (RoleAssignmentException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error(e.getMessage()));
        }
    }

    private AuthenticatedUser actor(Authentication authentication) {
        return authenticatedUserResolver.resolve(authentication);
    }

    private static Map<String, String> error(String message) {
        return Map.of("error", message);
    }
}
