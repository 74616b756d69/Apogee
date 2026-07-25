package com.space.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;

@Slf4j
@Service
public class ImageCacheService {

    @Value("${image.cache.dir:${user.home}/.space-app/images}")
    private String cacheDir;

    private static final String URL_PREFIX = "/space-images/";
    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();

    public boolean isCached(String imageUrl) {
        return imageUrl != null && imageUrl.startsWith(URL_PREFIX);
    }

    /**
     * 外部 URL から画像をダウンロードしてローカルに保存する。
     * @return ローカル配信パス（例: /space-images/abc123.jpg）、失敗時は元の URL
     */
    public String cache(String launchId, String externalUrl) {
        if (externalUrl == null || externalUrl.isBlank()) return externalUrl;
        if (isCached(externalUrl)) return externalUrl;

        try {
            Path dir = Paths.get(cacheDir);
            Files.createDirectories(dir);

            String ext = guessExtension(externalUrl);
            String filename = launchId + ext;
            Path dest = dir.resolve(filename);

            if (Files.exists(dest)) {
                return URL_PREFIX + filename;
            }

            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(externalUrl))
                .timeout(Duration.ofSeconds(15))
                .GET()
                .build();

            HttpResponse<InputStream> resp = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
            if (resp.statusCode() == 200) {
                Files.copy(resp.body(), dest);
                log.debug("Cached image: {}", filename);
                return URL_PREFIX + filename;
            }
            log.warn("Image download failed: HTTP {} for {}", resp.statusCode(), externalUrl);

        } catch (Exception e) {
            log.warn("Image cache error for {}: {}", launchId, e.getMessage());
        }
        return externalUrl;
    }

    public Path getCacheDir() {
        return Paths.get(cacheDir);
    }

    private String guessExtension(String url) {
        String path = url.split("\\?")[0];
        int dot = path.lastIndexOf('.');
        if (dot > 0) {
            String ext = path.substring(dot).toLowerCase();
            if (ext.matches("\\.(jpg|jpeg|png|webp|gif)")) return ext;
        }
        return ".jpg";
    }
}
