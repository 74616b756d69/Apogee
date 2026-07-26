package com.space.controller;

import com.space.dto.SpaceflightNewsResponse;
import com.space.model.Launch;
import com.space.repository.LaunchRepository;
import com.space.service.SpaceflightNewsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 打ち上げ情報 REST API
 *
 * GET /api/launches/upcoming   — 打ち上げ予定一覧 (日付昇順)
 * GET /api/launches/previous   — 過去の打ち上げ一覧 (日付降順)
 * GET /api/launches/{id}/news  — 指定した打ち上げに関連するニュース記事
 */
@RestController
@RequestMapping("/api/launches")
@RequiredArgsConstructor
public class LaunchController {

    private final LaunchRepository launchRepository;
    private final SpaceflightNewsService spaceflightNewsService;

    @GetMapping("/upcoming")
    public List<Launch> getUpcomingLaunches() {
        return launchRepository.findByUpcomingTrueOrderByNetAsc();
    }

    @GetMapping("/previous")
    public List<Launch> getPreviousLaunches() {
        return launchRepository.findByUpcomingFalseOrderByNetDesc();
    }

    @GetMapping("/{id}/news")
    public List<SpaceflightNewsResponse.ArticleDto> getLaunchNews(@PathVariable String id) {
        SpaceflightNewsResponse response = spaceflightNewsService.fetchArticlesForLaunch(id, 5);
        return response != null && response.getResults() != null ? response.getResults() : List.of();
    }
}
