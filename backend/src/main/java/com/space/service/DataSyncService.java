package com.space.service;

import com.space.dto.AgencyApiResponse;
import com.space.dto.LaunchApiResponse;
import com.space.model.Agency;
import com.space.model.Launch;
import com.space.repository.AgencyRepository;
import com.space.repository.LaunchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * Space Launch Now API からデータを取得し MySQL に保存するサービス
 *
 * スケジュール:
 *   - アプリ起動時に1回実行
 *   - その後6時間ごとに自動同期
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DataSyncService {

    private final SpaceLaunchNowService apiService;
    private final LaunchRepository launchRepository;
    private final AgencyRepository agencyRepository;
    private final ImageCacheService imageCacheService;

    /** アプリが完全に起動したタイミングで初回同期を実行 */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        log.info("Application ready — starting initial data sync...");
        syncAll();
    }

    /** 6時間ごとに自動同期 (毎日 0/6/12/18 時に実行) */
    @Scheduled(cron = "0 0 */6 * * *")
    public void scheduledSync() {
        log.info("Scheduled sync triggered.");
        syncAll();
    }

    @Transactional
    public void syncAll() {
        syncUpcomingLaunches();
        syncPreviousLaunches();
        syncAgencies();
        cacheImages();
        cleanupOldLaunches();
        log.info("Data sync completed.");
    }

    // =========================================================
    // 各同期処理
    // =========================================================

    private void syncUpcomingLaunches() {
        try {
            LaunchApiResponse response = apiService.fetchUpcomingLaunches(20);
            if (response == null || response.getResults() == null) return;

            List<Launch> launches = response.getResults().stream()
                    .map(r -> mapToLaunch(r, true))
                    .toList();
            launchRepository.saveAll(launches);
            log.info("Synced {} upcoming launches.", launches.size());

        } catch (Exception e) {
            log.error("Failed to sync upcoming launches: {}", e.getMessage());
        }
    }

    private void syncPreviousLaunches() {
        try {
            LaunchApiResponse response = apiService.fetchPreviousLaunches(20);
            if (response == null || response.getResults() == null) return;

            List<Launch> launches = response.getResults().stream()
                    .map(r -> mapToLaunch(r, false))
                    .toList();
            launchRepository.saveAll(launches);
            log.info("Synced {} previous launches.", launches.size());

        } catch (Exception e) {
            log.error("Failed to sync previous launches: {}", e.getMessage());
        }
    }

    private void syncAgencies() {
        try {
            AgencyApiResponse response = apiService.fetchAgencies(20);
            if (response == null || response.getResults() == null) return;

            List<Agency> agencies = response.getResults().stream()
                    .map(this::mapToAgency)
                    .toList();
            agencyRepository.saveAll(agencies);
            log.info("Synced {} agencies.", agencies.size());

        } catch (Exception e) {
            log.error("Failed to sync agencies: {}", e.getMessage());
        }
    }

    // =========================================================
    // DTO → エンティティ変換
    // =========================================================

    private Launch mapToLaunch(LaunchApiResponse.LaunchResult r, boolean isUpcoming) {
        Launch launch = new Launch();
        launch.setId(r.getId());
        launch.setName(r.getName());
        launch.setNet(r.getNet());
        launch.setUpcoming(isUpcoming);

        if (r.getStatus() != null) {
            launch.setStatusName(r.getStatus().getName());
        }

        if (r.getRocket() != null && r.getRocket().getConfiguration() != null) {
            launch.setRocketName(r.getRocket().getConfiguration().getName());
        }

        if (r.getMission() != null) {
            launch.setMissionName(r.getMission().getName());
            launch.setMissionDescription(r.getMission().getDescription());
            launch.setMissionType(r.getMission().getType());
        }

        if (r.getPad() != null) {
            launch.setPadName(r.getPad().getName());
            launch.setPadLatitude(r.getPad().getLatitude());
            launch.setPadLongitude(r.getPad().getLongitude());
            if (r.getPad().getLocation() != null) {
                launch.setLocationName(r.getPad().getLocation().getName());
            }
        }

        launch.setImageUrl(r.getImage());
        return launch;
    }

    /** 未キャッシュの画像をローカルに保存し imageUrl を更新する */
    private void cacheImages() {
        try {
            List<Launch> uncached = launchRepository.findAll().stream()
                .filter(l -> !imageCacheService.isCached(l.getImageUrl()))
                .toList();
            if (uncached.isEmpty()) return;

            log.info("Caching {} launch images...", uncached.size());
            for (Launch launch : uncached) {
                String localUrl = imageCacheService.cache(launch.getId(), launch.getImageUrl());
                launch.setImageUrl(localUrl);
            }
            launchRepository.saveAll(uncached);
            log.info("Image cache complete.");
        } catch (Exception e) {
            log.error("Image caching failed: {}", e.getMessage());
        }
    }

    /** 2ヶ月以上前の過去打ち上げを削除する */
    private void cleanupOldLaunches() {
        try {
            String cutoff = LocalDate.now().minusMonths(2) + "T00:00:00Z";
            launchRepository.deleteOldPreviousLaunches(cutoff);
            log.info("Cleaned up previous launches older than 2 months.");
        } catch (Exception e) {
            log.error("Cleanup failed: {}", e.getMessage());
        }
    }

    private Agency mapToAgency(AgencyApiResponse.AgencyResult r) {
        Agency agency = new Agency();
        agency.setId(r.getId());
        agency.setName(r.getName());
        agency.setAbbrev(r.getAbbrev());
        agency.setType(r.getType());
        agency.setCountryCode(r.getCountryCode());
        agency.setDescription(r.getDescription());
        agency.setImageUrl(r.getImageUrl());
        agency.setLogoUrl(r.getLogoUrl());
        return agency;
    }
}
