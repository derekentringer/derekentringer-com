FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/finance-api/package.json ./packages/finance-api/package.json
RUN npm ci --workspace=@derekentringer/finance-api --workspace=@derekentringer/shared
COPY packages/shared ./packages/shared
COPY packages/finance-api ./packages/finance-api
COPY tsconfig.base.json ./
RUN npm run build --workspace=@derekentringer/shared
RUN npm run build --workspace=@derekentringer/finance-api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/finance-api/dist ./dist
COPY --from=builder /app/packages/finance-api/package.json ./
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/index.js"]
