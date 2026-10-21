FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN cp -r src/db/schema.sql dist/db/schema.sql 2>/dev/null || mkdir -p dist/db && cp src/db/schema.sql dist/db/schema.sql

EXPOSE 3000

CMD ["node", "dist/server.js"]
