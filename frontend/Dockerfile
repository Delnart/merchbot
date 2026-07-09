FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# next.config.ts uses output: "export" — serve the static build
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g serve@14
COPY --from=build /app/out ./out
EXPOSE 3000
CMD ["serve", "-s", "out", "-l", "3000"]
