# The assets stage is independent of application dependencies. A local image with
# /app/assets can seed an offline rebuild via MAP_ASSET_IMAGE.
ARG MAP_ASSET_IMAGE=node:22-alpine
FROM ${MAP_ASSET_IMAGE} AS assets
RUN if [ ! -d /app/assets/fonts ] || [ ! -d /app/assets/sprites ]; then \
      apk add --no-cache curl unzip && \
      curl --fail --location --retry 3 --max-time 300 https://codeload.github.com/protomaps/basemaps-assets/zip/refs/heads/main -o /tmp/maps-assets.zip && \
      unzip -q /tmp/maps-assets.zip -d /tmp && mkdir -p /app/assets && \
      mv /tmp/basemaps-assets-main/fonts /tmp/basemaps-assets-main/sprites /app/assets/ && \
      rm -rf /tmp/maps-assets.zip /tmp/basemaps-assets-main; \
    fi
FROM protomaps/go-pmtiles:v1.31.2 AS pmtiles
FROM node:22-alpine
WORKDIR /app
COPY --from=pmtiles /go-pmtiles /usr/local/bin/pmtiles
COPY --from=assets /app/assets /app/assets
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
ENV MAP_DATA_DIR=/data MAP_ASSET_DIR=/app/assets
EXPOSE 8090
CMD ["node", "server.mjs"]
