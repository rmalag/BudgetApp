# Multi-stage build to keep image small
FROM node:20-alpine AS app

WORKDIR /app

# Copy only necessary files
COPY app.js dev-server.js index.html styles.css sw.js manifest.webmanifest firestore.rules ./
COPY icons ./icons

# Create a startup script that injects Firebase config from environment
RUN echo '#!/bin/sh\n\
if [ -z "$FIREBASE_PROJECT_ID" ]; then\n\
  echo "ERROR: FIREBASE_PROJECT_ID environment variable is not set"\n\
  exit 1\n\
fi\n\
\n\
exec node dev-server.js\n\
' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 4173

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require(\"http\").get(\"http://localhost:4173\", (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)}).on(\"error\", () => { throw new Error(\"healthcheck failed\") })"

ENTRYPOINT ["/app/start.sh"]
