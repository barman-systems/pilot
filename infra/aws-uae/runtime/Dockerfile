FROM node:24.19.0-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY api ./api
COPY index.html booking.html team.html ./
COPY infra/aws-uae/runtime/server.mjs ./infra/aws-uae/runtime/server.mjs

USER node
EXPOSE 8080

CMD ["node", "infra/aws-uae/runtime/server.mjs"]
