const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = process.env.PORT || 4173;
const host = process.env.HOST || "0.0.0.0";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

// Build Firebase config from environment variables if available
function getFirebaseConfigScript() {
  if (process.env.FIREBASE_PROJECT_ID) {
    const config = {
      workspaceId: process.env.WORKSPACE_ID || "default",
      projectId: process.env.FIREBASE_PROJECT_ID,
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      measurementId: process.env.FIREBASE_MEASUREMENT_ID
    };
    return `<script>window.FIREBASE_CONFIG = ${JSON.stringify(config)};</script>`;
  }
  return "";
}

http
  .createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
    if (pathname === "/") pathname = "/index.html";

    const filePath = path.normalize(path.join(root, pathname));
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      let content = data.toString();
      // Inject Firebase config into HTML before closing </head>
      if (pathname === "/index.html") {
        const firebaseScript = getFirebaseConfigScript();
        content = content.replace("</head>", `${firebaseScript}</head>`);
      }

      res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
      res.end(content);
    });
  })
  .listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`);
  });
