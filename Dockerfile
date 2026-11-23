# Imagem da API (server/). O front continua na Vercel.
# Node 22.15+ é necessário por causa do zlib.createZstdDecompress.
FROM node:22-slim

# Stockfish certo para a arquitetura do servidor:
# - x86-64 (Intel/AMD): binário oficial 17.1 (build sse41-popcnt);
# - outras, como ARM64 (SnapDeploy roda em ARM): pacote stockfish do Debian.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
      curl -fsSL https://github.com/official-stockfish/Stockfish/releases/download/sf_17.1/stockfish-ubuntu-x86-64-sse41-popcnt.tar \
        | tar -x -C /opt \
      && mv /opt/stockfish/stockfish-ubuntu-x86-64-sse41-popcnt /usr/local/bin/stockfish \
      && rm -rf /opt/stockfish; \
    else \
      apt-get install -y --no-install-recommends stockfish \
      && ln -s /usr/games/stockfish /usr/local/bin/stockfish; \
    fi \
 && chmod +x /usr/local/bin/stockfish \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server

ENV NODE_ENV=production \
    STOCKFISH_PATH=/usr/local/bin/stockfish \
    SF_THREADS=1 \
    SF_TIMEOUT_MS=45000

# O servidor usa a variável PORT se a plataforma definir; senão, 8787.
EXPOSE 8787

CMD ["node", "server/index.mjs"]
