package com.space.repository;

import com.space.model.BookingLink;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BookingLinkRepository extends JpaRepository<BookingLink, String> {
}
