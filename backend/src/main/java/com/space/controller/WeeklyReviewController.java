package com.space.controller;

import com.space.dto.WeeklyReviewDto;
import com.space.service.WeeklyReviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/review")
@RequiredArgsConstructor
public class WeeklyReviewController {

    private final WeeklyReviewService weeklyReviewService;

    @GetMapping("/weekly")
    public WeeklyReviewDto getWeeklyReview(@RequestParam String week) {
        try {
            return weeklyReviewService.getWeeklyReview(week);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }
}
