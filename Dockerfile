# MyPOSFO image: the built front end served by nginx, which also forwards /api and /health to the API container.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# mock = runs on built-in demo data (until the API covers every screen); api = talks to MyPosAPI.
ARG VITE_DATA_SOURCE=mock
ARG VITE_APP_VERSION=dev
ENV VITE_DATA_SOURCE=$VITE_DATA_SOURCE VITE_APP_VERSION=$VITE_APP_VERSION
RUN npm run build && echo "$VITE_APP_VERSION" > dist/version.txt

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
