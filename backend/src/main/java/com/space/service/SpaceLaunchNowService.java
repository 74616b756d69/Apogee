package com.space.service;

import com.space.dto.AgencyApiResponse;
import com.space.dto.LaunchApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * Space Launch Now API を呼び出すサービス
 * API ドキュメント: https://ll.thespacedevs.com/2.2.0/swagger/
 *
 * ※ 無料プランのレート制限: 15リクエスト/時間
 *    開発時は space.api.base-url を https://lldev.thespacedevs.com/2.2.0 に変更推奨
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SpaceLaunchNowService {

    private final RestTemplate restTemplate;

    @Value("${space.api.base-url:https://ll.thespacedevs.com/2.2.0}")
    private String baseUrl;

    /**
     * 打ち上げ予定一覧を取得する
     *
     * @param limit 取得件数 (最大100)
     */
    public LaunchApiResponse fetchUpcomingLaunches(int limit) {
        String url = baseUrl + "/launch/upcoming/?format=json&limit=" + limit;
        log.info("Fetching upcoming launches: {}", url);
        return restTemplate.getForObject(url, LaunchApiResponse.class);
    }

    /**
     * 過去の打ち上げ一覧を取得する
     *
     * @param limit 取得件数 (最大100)
     */
    public LaunchApiResponse fetchPreviousLaunches(int limit) {
        String url = baseUrl + "/launch/previous/?format=json&limit=" + limit;
        log.info("Fetching previous launches: {}", url);
        return restTemplate.getForObject(url, LaunchApiResponse.class);
    }

    /**
     * 宇宙機関一覧を取得する
     *
     * @param limit 取得件数 (最大100)
     */
    public AgencyApiResponse fetchAgencies(int limit) {
        String url = baseUrl + "/agencies/?format=json&limit=" + limit;
        log.info("Fetching agencies: {}", url);
        return restTemplate.getForObject(url, AgencyApiResponse.class);
    }
}
