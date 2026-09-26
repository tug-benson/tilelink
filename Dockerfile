FROM node:22-alpine

LABEL org.opencontainers.image.title="TileLink" \
      org.opencontainers.image.description="Page de liens self-hosted en tuiles (+ mini-backend admin)" \
      org.opencontainers.image.source="https://github.com/tug-benson/tilelink"

WORKDIR /app
COPY package.json server.js index.html style.css app.js config.yaml custom.json ./
COPY icons/ ./icons/

ENV PORT=80
EXPOSE 80
CMD ["node", "server.js"]
