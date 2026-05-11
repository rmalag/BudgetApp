const http = require("http");
const https = require("https");
const sslKey = process.env.SSL_KEY;
const sslCert = process.env.SSL_CERT;
const sslCa = process.env.SSL_CA;
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

const USERNAME = process.env.USERNAME || '';
const PASSWORD = process.env.PASSWORD || '';

const requestHandler = (req, res) => {
  let proto = sslKey && sslCert ? "https" : "http";
  let pathname = decodeURIComponent(new URL(req.url, `${proto}://${host}`).pathname);

  // Endpoint autenticazione
  if (pathname === "/auth" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const { username, password } = JSON.parse(body);
        if (
          typeof username === "string" &&
          typeof password === "string" &&
          username === USERNAME &&
          password === PASSWORD
        ) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
        }
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad request" }));
      }
    });
    return;
  }

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
};

if (sslKey && sslCert) {
  const options = {
    key: fs.readFileSync(sslKey),
    cert: fs.readFileSync(sslCert),
    ca: sslCa ? fs.readFileSync(sslCa) : undefined
  };
  https.createServer(options, requestHandler).listen(port, host, () => {
    console.log(`Server listening on https://${host}:${port}`);
  });
} else {
  http.createServer(requestHandler).listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`);
  });
}
