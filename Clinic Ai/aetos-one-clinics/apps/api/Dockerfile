FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json ./
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
RUN npm install --workspace=apps/api --workspace=packages/shared-types --include-workspace-root
RUN npm run build -w packages/shared-types
RUN npx --workspace=apps/api prisma generate
RUN npm run build -w apps/api

FROM node:20-alpine
WORKDIR /app
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/node_modules/@aetos ./node_modules/@aetos
EXPOSE 3000
CMD ["node", "dist/main.js"]
