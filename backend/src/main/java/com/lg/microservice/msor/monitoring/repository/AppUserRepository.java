package com.lg.microservice.msor.monitoring.repository;

import com.lg.microservice.msor.monitoring.model.entity.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    /**
     * The caller is expected to have lower-cased the email already. The lookup is nonetheless
     * case-insensitive in practice — the column's collation is — so a row written by hand with mixed
     * case still resolves.
     */
    Optional<AppUser> findByEmail(String email);

    List<AppUser> findAllByOrderByEmailAsc();
}
