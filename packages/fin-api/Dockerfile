FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/fin-api/package.json ./packages/fin-api/package.json
RUN npm ci --workspace=@derekentringer/fin-api --workspace=@derekentringer/shared
COPY packages/shared ./packages/shared
COPY packages/fin-api ./packages/fin-api
COPY tsconfig.base.json ./
RUN npm run build --workspace=@derekentringer/shared
RUN npm run build --workspace=@derekentringer/fin-api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/fin-api/dist ./dist
COPY --from=builder /app/packages/fin-api/package.json ./
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/index.js"]
