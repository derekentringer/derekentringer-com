FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/package.json
RUN npm ci --workspace=@derekentringer/web
COPY packages/web ./packages/web
RUN npm run build --workspace=@derekentringer/web

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/packages/web/dist ./dist
CMD sh -c "serve dist -s -l tcp://0.0.0.0:${PORT:-8080}"
