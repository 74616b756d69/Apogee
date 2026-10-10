package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BookingLinkCreateDto {
    private String title;
    private int durationMinutes;           // 30, 60, etc.
    private String calendarName;           // which calendar to book into
    private List<AvailabilityRuleDto> rules;  // Mon-Fri 10:00-18:00, etc.
}
