# Multi-stage build to keep image small
FROM node:20-alpine AS app

WORKDIR /app


# Copy only necessary files
COPY app.js dev-server.js index.html styles.css sw.js manifest.webmanifest firestore.rules ./
COPY icons ./icons
COPY start.sh ./
# Copy certs if present
COPY certs ./certs

# Make startup script executable
RUN chmod +x /app/start.sh

EXPOSE 4173

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require(\"http\").get(\"https://localhost:${PORT:-4173}\", (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)}).on(\"error\", () => { throw new Error(\"healthcheck failed\") })"

ENTRYPOINT ["/app/start.sh"]
