FROM node:22-alpine

WORKDIR /app
COPY --chown=node:node . .

ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787

USER node
CMD ["node", "api/src/server.js"]
