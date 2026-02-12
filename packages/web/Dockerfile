FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/package.json
RUN npm ci --workspace=@derekentringer/web
COPY packages/web ./packages/web
RUN npm run build --workspace=@derekentringer/web

FROM nginx:alpine
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
CMD sh -c "sed -i s/PORT_PLACEHOLDER/${PORT:-8080}/g /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
