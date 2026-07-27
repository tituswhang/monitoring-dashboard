package com.lg.microservice.msor.monitoring.repository;

import com.lg.microservice.msor.monitoring.model.entity.AppUserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AppUserRoleRepository extends JpaRepository<AppUserRole, Long> {

    /**
     * The role names granted to an active user, in one query. This sits on the request path for
     * every authenticated call (behind {@code RoleResolver}'s cache), so it compares {@code email}
     * directly rather than wrapping it in {@code LOWER(...)}, which would make the unique index on
     * the column unusable. Case-insensitivity comes from the column's collation instead.
     *
     * <p>A deactivated user resolves to no roles, and therefore to the default role — not to their
     * old ones.
     */
    @Query("SELECT r.role FROM AppUserRole r WHERE r.user.email = :email AND r.user.active = true")
    List<String> findRoleNamesByEmail(@Param("email") String email);

    /** Every grant, with its user attached — one query behind the admin table. */
    @Query("SELECT r FROM AppUserRole r JOIN FETCH r.user")
    List<AppUserRole> findAllWithUser();

    /**
     * How many active users hold {@code role}. Guards the last admin: the app must not be able to
     * lock every one of its own admins out of it.
     */
    @Query("SELECT COUNT(r) FROM AppUserRole r WHERE r.role = :role AND r.user.active = true")
    long countActiveHolders(@Param("role") String role);

    @Modifying
    @Query("DELETE FROM AppUserRole r WHERE r.user.id = :userId")
    void deleteByUserId(@Param("userId") Long userId);
}
