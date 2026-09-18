package com.space.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Entity
@Table(name = "booking_links")
public class BookingLink {

    @Id
    private String id;  // UUID

    @Column(length = 255)
    private String title;

    @Column(name = "duration_minutes")
    private int durationMinutes;

    @Column(name = "calendar_name", length = 255)
    private String calendarName;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "booking_link_id")
    private List<AvailabilityRule> rules;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
