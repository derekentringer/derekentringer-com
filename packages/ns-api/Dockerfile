FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/ns-api/package.json ./packages/ns-api/package.json
RUN npm ci --workspace=@derekentringer/ns-api --workspace=@derekentringer/shared
COPY packages/shared ./packages/shared
COPY packages/ns-api ./packages/ns-api
COPY tsconfig.base.json ./
RUN npm run build --workspace=@derekentringer/shared
RUN npm run build --workspace=@derekentringer/ns-api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/ns-api/dist ./dist
COPY --from=builder /app/packages/ns-api/package.json ./
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3004
CMD ["node", "dist/index.js"]
