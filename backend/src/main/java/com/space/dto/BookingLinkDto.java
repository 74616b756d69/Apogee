package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BookingLinkDto {
    private String uuid;
    private String title;
    private int durationMinutes;
    private String calendarName;
    private List<AvailabilityRuleDto> rules;
    private String createdAt;   // ISO 8601
}
