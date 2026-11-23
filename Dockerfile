# Imagem da API (server/). O front continua na Vercel.
# Node 22.15+ é necessário por causa do zlib.createZstdDecompress.
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Stockfish 17.1 para Linux (build sse41-popcnt, roda em praticamente qualquer CPU x86-64).
RUN curl -fsSL https://github.com/official-stockfish/Stockfish/releases/download/sf_17.1/stockfish-ubuntu-x86-64-sse41-popcnt.tar \
    | tar -x -C /opt \
 && mv /opt/stockfish/stockfish-ubuntu-x86-64-sse41-popcnt /usr/local/bin/stockfish \
 && chmod +x /usr/local/bin/stockfish \
 && rm -rf /opt/stockfish

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server

ENV NODE_ENV=production \
    STOCKFISH_PATH=/usr/local/bin/stockfish \
    SF_THREADS=1 \
    SF_TIMEOUT_MS=45000

CMD ["node", "server/index.mjs"]
