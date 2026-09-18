package com.space.model;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "availability_rules")
public class AvailabilityRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "booking_link_id")
    private String bookingLinkId;

    @Column(name = "day_of_week")
    private int dayOfWeek;  // 1=Monday, 7=Sunday (ISO 8601)

    @Column(name = "start_time", length = 5)
    private String startTime;  // "HH:mm"

    @Column(name = "end_time", length = 5)
    private String endTime;    // "HH:mm"
}
