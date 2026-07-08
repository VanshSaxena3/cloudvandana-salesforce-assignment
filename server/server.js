require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const jsforce = require("jsforce");
const crypto = require("crypto");

const app = express();

app.use(cors({ 
  origin: ["http://localhost:3000", "https://cloudvandana-salesforce-assignment.vercel.app"], 
  credentials: true 
}));
app.use(express.json());

app.use(
  session({
    secret: "cloudvandana_secret",
    resave: false,
    saveUninitialized: true,
    cookie: { httpOnly: true },
  })
);

// ---------- PKCE helpers ----------
function base64URLEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return base64URLEncode(hash);
}
// -----------------------------------

app.get("/", (req, res) => {
  res.send("CloudVandana Backend Running 🚀");
});

app.get("/test", (req, res) => {
  res.json({ message: "Backend is working successfully 🚀", port: process.env.PORT });
});

// LOGIN — generates PKCE pair, stores verifier in session, redirects to Salesforce
app.get("/login", (req, res) => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  req.session.codeVerifier = codeVerifier;

  const authUrl =
    `${process.env.LOGIN_URL}/services/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${process.env.CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;

  res.redirect(authUrl);
});

// CALLBACK — exchanges code + original verifier for access token
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  const codeVerifier = req.session.codeVerifier;

  if (!code || !codeVerifier) {
    return res.status(400).send("Missing code or code_verifier in session");
  }

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("client_id", process.env.CLIENT_ID);
    params.append("client_secret", process.env.CLIENT_SECRET);
    params.append("redirect_uri", process.env.REDIRECT_URI);
    params.append("code_verifier", codeVerifier);

    const response = await fetch(`${process.env.LOGIN_URL}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    const data = await response.json();

    if (data.error) {
      console.error("Token exchange error:", data);
      return res.status(400).json(data);
    }

    // Store tokens in session
    req.session.accessToken = data.access_token;
    req.session.instanceUrl = data.instance_url;

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
res.redirect(`${frontendUrl}?login=success`);
  } catch (err) {
    console.error(err);
    res.status(500).send("OAuth Error");
  }
});

// Helper: build a jsforce connection from session tokens
function getConnFromSession(req) {
  if (!req.session.accessToken) return null;
  return new jsforce.Connection({
    accessToken: req.session.accessToken,
    instanceUrl: req.session.instanceUrl,
  });
}

// GET VALIDATION RULES (via Tooling API)
app.get("/validation-rules", async (req, res) => {
  const conn = getConnFromSession(req);
  if (!conn) return res.status(401).json({ error: "Not logged in" });

  try {
    const result = await conn.tooling.query(
      "SELECT Id, ValidationName, Active, ErrorMessage, EntityDefinitionId FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Account'"
    );
    res.json(result.records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// TOGGLE a single validation rule active/inactive
app.post("/validation-rules/:id/toggle", async (req, res) => {
  const conn = getConnFromSession(req);
  if (!conn) return res.status(401).json({ error: "Not logged in" });

  const { id } = req.params;
  const { active } = req.body; // true / false

  try {
    // Step 1: Fetch the current full Metadata for this rule
    const existing = await conn.tooling.sobject("ValidationRule").retrieve(id);

    // Step 2: Update only the "active" flag inside Metadata, keep rest same
    const updatedMetadata = {
      ...existing.Metadata,
      active: active,
    };

    // Step 3: Send the full Metadata back with the update
    await conn.tooling.sobject("ValidationRule").update({
      Id: id,
      Metadata: updatedMetadata,
    });

    res.json({ success: true, id, active });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || JSON.stringify(err) });
  }
});

// BULK toggle multiple validation rules active/inactive
app.post("/validation-rules/bulk-toggle", async (req, res) => {
  const conn = getConnFromSession(req);
  if (!conn) return res.status(401).json({ error: "Not logged in" });

  const { ids, active } = req.body; // ids = array of rule Ids, active = true/false

  try {
    const results = [];

    for (const id of ids) {
      // Step 1: Fetch current Metadata for this rule
      const existing = await conn.tooling.sobject("ValidationRule").retrieve(id);

      // Step 2: Update only the "active" flag, keep rest same
      const updatedMetadata = {
        ...existing.Metadata,
        active: active,
      };

      // Step 3: Send updated Metadata back
      await conn.tooling.sobject("ValidationRule").update({
        Id: id,
        Metadata: updatedMetadata,
      });

      results.push({ id, active, success: true });
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || JSON.stringify(err) });
  }
});

// CHECK login status (React can call this on load)
app.get("/status", (req, res) => {
  res.json({ loggedIn: !!req.session.accessToken });
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});