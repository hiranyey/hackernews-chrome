# Node 24 is the current LTS and runs .ts files directly via type stripping
FROM node:24-alpine

WORKDIR /app

# Copy package files first to leverage Docker's layer caching for dependencies
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.ts ./

# Run as the unprivileged user that ships with the node image
USER node

EXPOSE 8000

CMD ["node", "index.ts"]
