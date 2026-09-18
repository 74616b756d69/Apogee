package com.space.config;

import com.space.service.ImageCacheService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final ImageCacheService imageCacheService;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = "file:" + imageCacheService.getCacheDir().toAbsolutePath() + "/";
        registry.addResourceHandler("/space-images/**")
                .addResourceLocations(location)
                .setCachePeriod(604800); // ブラウザに1週間キャッシュさせる

        // SPA fallback for public booking pages
        registry.addResourceHandler("/booking/**")
                .addResourceLocations("classpath:/static/")
                .resourceChain(false);
    }
}
