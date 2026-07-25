package com.space.controller;

import com.space.model.Launch;
import com.space.repository.LaunchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 打ち上げ情報 REST API
 *
 * GET /api/launches/upcoming  — 打ち上げ予定一覧 (日付昇順)
 * GET /api/launches/previous  — 過去の打ち上げ一覧 (日付降順)
 */
@RestController
@RequestMapping("/api/launches")
@RequiredArgsConstructor
public class LaunchController {

    private final LaunchRepository launchRepository;

    @GetMapping("/upcoming")
    public List<Launch> getUpcomingLaunches() {
        return launchRepository.findByUpcomingTrueOrderByNetAsc();
    }

    @GetMapping("/previous")
    public List<Launch> getPreviousLaunches() {
        return launchRepository.findByUpcomingFalseOrderByNetDesc();
    }
}
