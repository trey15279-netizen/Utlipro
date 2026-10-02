FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATABASE_PATH=/data/commandhub.db PORT=3000
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY public ./public
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
