package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AvailabilityRuleDto {
    private int dayOfWeek;      // 1=Monday, 7=Sunday (ISO 8601)
    private String startTime;   // "HH:mm"
    private String endTime;     // "HH:mm"
}
