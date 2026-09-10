# Spike A voice recorder — linux/amd64 for Cloudflare Containers.
# Not production-armed. Mickael builds/pushes this image; do not wrangler deploy
# from CI. Never bake tokens into the image.
FROM oven/bun:1.4-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN bun install --production

ENV PORT=8080
EXPOSE 8080
CMD ["bun", "run", "src/index.ts"]
