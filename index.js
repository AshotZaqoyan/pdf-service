import express from "express";
import puppeteer from "puppeteer";
import { PassThrough } from "stream";
import { google } from "googleapis";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

// OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.OAUTH_CALLBACK_URL || `http://localhost:${PORT}/oauth/callback`
);

let tokens = null;
const drive = google.drive({ version: "v3", auth: oauth2Client });
// No default folder - files will go to Drive root if no folderId provided

// Load tokens if exist
if (fs.existsSync("tokens.json")) {
  try {
    tokens = JSON.parse(fs.readFileSync("tokens.json", "utf8"));
    oauth2Client.setCredentials(tokens);
    console.log("Loaded existing tokens");
  } catch (err) {
    console.error("Failed to load tokens:", err.message);
  }
}

// Start OAuth flow
app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive"],
    prompt: "consent",
  });
  res.redirect(url);
});

// OAuth callback
app.get("/oauth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code");

  try {
    const { tokens: newTokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(newTokens);
    fs.writeFileSync("tokens.json", JSON.stringify(newTokens, null, 2));
    tokens = newTokens;
    res.send("<h1>Authentication successful!</h1><p>You can now upload PDFs.</p>");
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("Authentication failed");
  }
});

// Check auth status
app.get("/auth-status", (req, res) => {
  if (tokens) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false, authUrl: "/auth" });
  }
});

// Main endpoint: HTML → PDF → Drive
app.post("/upload-pdf", async (req, res) => {
  console.log("Full request body:", req.body);
  const { html, name, folderId } = req.body;
  if (!html) return res.status(400).json({ error: "HTML content required" });

  // Load tokens if needed
  if (!tokens && fs.existsSync("tokens.json")) {
    tokens = JSON.parse(fs.readFileSync("tokens.json", "utf8"));
    oauth2Client.setCredentials(tokens);
  }
  if (!tokens) return res.status(401).json({ error: "Not authenticated", authUrl: "/auth" });
  
  const fileName = name ? `${name}.pdf` : `document-${Date.now()}.pdf`;

  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

		await new Promise(resolve => setTimeout(resolve, 3000));

		await page.evaluate(() => {
			const canvases = document.querySelectorAll("canvas");
			canvases.forEach(canvas => {
				const img = document.createElement("img");
				img.src = canvas.toDataURL("image/png", 1.0); 
				img.style.width = canvas.style.width || canvas.width + "px";
				img.style.height = canvas.style.height || canvas.height + "px";
				canvas.replaceWith(img); 
			});
		});

    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const heightInMM = Math.max(297, (bodyHeight * 0.264583)); 

    const pdfBuffer = await page.pdf({
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      width: "210mm",
      height: `${heightInMM}mm`,
    });

    const bufferStream = new PassThrough();
    bufferStream.end(pdfBuffer);

    const fileMetadata = { name: fileName };
    if (folderId) fileMetadata.parents = [folderId];

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: { mimeType: "application/pdf", body: bufferStream },
      fields: "id, webViewLink",
    });

    res.json({
      success: true,
      fileId: file.data.id,
      viewLink: file.data.webViewLink,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 PDF API running on http://localhost:${PORT}`);
  console.log(`📝 Visit http://localhost:${PORT}/auth to authenticate`);
});