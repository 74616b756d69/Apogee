package com.space.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "bookings")
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "booking_link_id")
    private String bookingLinkId;

    @Column(name = "slot_date", length = 10)
    private String slotDate;  // "YYYY-MM-DD"

    @Column(name = "slot_start_time", length = 5)
    private String slotStartTime;  // "HH:mm"

    @Column(name = "slot_end_time", length = 5)
    private String slotEndTime;    // "HH:mm"

    @Column(name = "guest_name", length = 255)
    private String guestName;

    @Column(name = "guest_email", length = 255)
    private String guestEmail;

    @Column(name = "guest_note", columnDefinition = "TEXT")
    private String guestNote;

    @Column(name = "caldav_raw_uid", length = 255)
    private String caldavRawUid;  // CalDAV event UID created for this booking

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
