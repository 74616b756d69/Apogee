package com.space.controller;

import com.space.dto.AvailabilityRuleDto;
import com.space.dto.AvailabilitySlotDto;
import com.space.service.AvailabilityService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/api/availability")
@RequiredArgsConstructor
public class AvailabilityController {

    private final AvailabilityService availabilityService;

    @GetMapping
    public List<AvailabilitySlotDto> getAvailableSlots(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam int duration,
            @RequestParam(required = false) String days,
            @RequestParam(defaultValue = "09:00") String start,
            @RequestParam(defaultValue = "18:00") String end) {

        List<AvailabilityRuleDto> rules = new ArrayList<>();
        if (days != null && !days.isBlank()) {
            String[] dayArray = days.split(",");
            Arrays.stream(dayArray).map(String::trim).forEach(dayStr -> {
                int isoDay = dayStringToISO(dayStr);
                if (isoDay > 0) {
                    rules.add(new AvailabilityRuleDto(isoDay, start, end));
                }
            });
        } else {
            for (int i = 1; i <= 5; i++) {
                rules.add(new AvailabilityRuleDto(i, start, end));
            }
        }

        return availabilityService.getAvailableSlots(from, to, duration, rules);
    }

    private int dayStringToISO(String day) {
        return switch (day.toUpperCase()) {
            case "MON" -> 1;
            case "TUE" -> 2;
            case "WED" -> 3;
            case "THU" -> 4;
            case "FRI" -> 5;
            case "SAT" -> 6;
            case "SUN" -> 7;
            default -> 0;
        };
    }
}
