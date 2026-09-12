FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json ./
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web
RUN npm install --workspace=apps/web --workspace=packages/shared-types --include-workspace-root
RUN npm run build -w packages/shared-types
RUN npm run build -w apps/web

FROM nginx:alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
