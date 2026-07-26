package com.space.service;

import com.space.dto.SpaceflightNewsResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * Spaceflight News API v4 を呼び出すサービス
 * API ドキュメント: https://api.spaceflightnewsapi.net/v4/docs/
 *
 * 記事の launches フィールドには Launch Library 2 と同じ打ち上げ UUID が
 * 紐づいており、launch パラメータでその打ち上げ関連の記事を絞り込める。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SpaceflightNewsService {

    private final RestTemplate restTemplate;

    @Value("${spaceflightnews.api.base-url:https://api.spaceflightnewsapi.net/v4}")
    private String baseUrl;

    /**
     * 指定した打ち上げに関連するニュース記事を取得する
     *
     * @param launchId Launch Library 2 の打ち上げ UUID
     * @param limit    取得件数
     */
    public SpaceflightNewsResponse fetchArticlesForLaunch(String launchId, int limit) {
        String url = baseUrl + "/articles/?launch=" + launchId + "&limit=" + limit;
        try {
            return restTemplate.getForObject(url, SpaceflightNewsResponse.class);
        } catch (Exception e) {
            log.warn("Failed to fetch news for launch {}: {}", launchId, e.getMessage());
            return null;
        }
    }
}
