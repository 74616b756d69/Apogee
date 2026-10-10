package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AvailabilitySlotDto {
    private String date;        // "YYYY-MM-DD"
    private String startTime;   // "HH:mm"
    private String endTime;     // "HH:mm"
}
