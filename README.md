# 📄 PDF Service Deployment Guide

This guide explains how to run the PDF Service (HTML to PDF with Google Drive upload) persistently across different systems. The service converts HTML content to PDF and automatically uploads to Google Drive using OAuth2 authentication.

---

## 🧪 Local Development (Testing)

### ✅ Prerequisites:

```bash
node --version  # v18+ required
npm --version
```

### ✅ Setup:

```bash
git clone https://github.com/AshotZaqoyan/pdf-service
cd pdf-service
npm install
cp .env.example .env
```

Edit `.env` file:
```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
OAUTH_CALLBACK_URL=your_callback_url
PORT=3000
```

### ✅ Run locally:

```bash
npm start
# or for development with auto-reload:
npm run dev
```

### ⚠️ Note:

- Visit `/auth` to authenticate with Google Drive first
- Keep the terminal open during testing — the service will shut down if closed
- `tokens.json` will be auto-generated after authentication

---

## 🚀 Production Deployment (Linux Server)

### Recommended Tool: `PM2`

> Best for Node.js applications with advanced monitoring, auto-restart, and log management

### 1. Install PM2 globally:

```bash
npm install -g pm2
```

### 2. Clone and setup your project:

```bash
git clone https://github.com/AshotZaqoyan/pdf-service
cd pdf-service
npm install --production
```

### 3. Create production environment:

```bash
cp .env.example .env
nano .env
```

Update `.env` for production:
```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
OAUTH_CALLBACK_URL=your_callback_url
PORT=3000
```

### 4. Create logs directory:

```bash
mkdir logs
```

### 5. Start with PM2:

```bash
pm2 start ecosystem.config.cjs --env production
```

### 6. Setup auto-start on system boot:

```bash
pm2 startup
pm2 save
```

### ✅ Benefits of PM2

- Service runs **even after logout or reboot**
- Automatically restarts on crash or memory issues
- Advanced monitoring and logging
- Zero-downtime restarts for updates
- Built-in load balancer support

---

## 🛑 PM2 Management Commands

### Check status:
```bash
pm2 status
pm2 list
```

### View logs:
```bash
pm2 logs pdf-service
pm2 logs pdf-service --lines 100
```

### Monitoring:
```bash
pm2 monit  # Real-time monitoring dashboard
```

### Restart/Stop:
```bash
pm2 restart pdf-service
pm2 stop pdf-service
pm2 delete pdf-service
```

### Update deployment:
```bash
git pull
npm install --production
pm2 reload pdf-service  # Zero-downtime restart
```

---

## 🌐 Nginx Reverse Proxy Setup

### Create Nginx config:

```bash
sudo nano /etc/nginx/sites-available/your.domain
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your.domain;
    return 301 https://your.domain$request_uri;
}

# SSL and Proxy Setting for PDF Service
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    
    ssl_certificate /etc/letsencrypt/live/your.domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your.domain/privkey.pem;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    
    include /etc/letsencrypt/options-ssl-nginx.conf;
    
    server_name your.domain;
    access_log /var/log/nginx/your.domain.log combined;
    error_log /var/log/nginx/your.domain.error.log warn;
    
    # Large file upload support for HTML content (50MB should be enough)
    client_max_body_size 50M;
    client_body_timeout 300s;
    client_header_timeout 300s;
    
    # Large client header buffers
    large_client_header_buffers 4 32k;
    
    # Compression for API responses
    gzip on;
    gzip_static on;
    gzip_comp_level 2;
    gzip_http_version 1.1;
    gzip_vary on;
    gzip_disable "msie6";
    gzip_min_length 250;
    gzip_proxied no-cache no-store private expired auth;
    gzip_types 
        text/plain 
        text/css 
        application/json
        application/javascript
        text/xml 
        application/xml 
        application/xml+rss 
        text/javascript;
    
    # Proxy settings optimized for PDF generation
    proxy_max_temp_file_size 0;
    proxy_read_timeout 300;  # PDF generation can take time
    proxy_connect_timeout 60;
    proxy_send_timeout 300;
    proxy_redirect off;
    
    location / {
        proxy_pass http://localhost:PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Buffer settings for PDF responses
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 8 128k;
        proxy_busy_buffers_size 256k;
        
        # Request body settings for HTML content
        proxy_request_buffering off;
        proxy_max_temp_file_size 50m;
    }
    
    # Health check endpoint
    location /auth-status {
        proxy_pass http://localhost:PORT/auth-status;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Quick response for status checks
        proxy_read_timeout 10;
        proxy_connect_timeout 5;
    }
}
```

### Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/your.domain /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Add SSL with Certbot:
```bash
sudo certbot --nginx -d your.domain
```

---

## 🔧 API Endpoints

### Authentication:
- `GET /auth` - Start Google OAuth flow
- `GET /oauth/callback` - OAuth callback (auto-configured)
- `GET /auth-status` - Check authentication status

### PDF Generation:
- `POST /upload-pdf` - Convert HTML to PDF and upload to Drive

### Example API Call:

```bash
curl -X POST https://your.domain/upload-pdf \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>Hello World</h1><p>This is a test PDF</p>",
    "name": "my-document",
    "folderId": "optional-google-drive-folder-id"
  }'
```

### Response:
```json
{
  "success": true,
  "fileId": "1ABC123XYZ",
  "viewLink": "https://drive.google.com/file/d/1ABC123XYZ/view"
}
```

---

## 📊 Features

- **HTML to PDF Conversion** - Uses Puppeteer for high-quality rendering
- **Google Drive Integration** - Automatic upload with OAuth2
- **Dynamic PDF Sizing** - A4 width with auto-height for single page
- **Folder Support** - Upload to specific Drive folders or root
- **Custom Naming** - Specify PDF filename or auto-generate
- **Error Handling** - Comprehensive error responses
- **Token Management** - Automatic OAuth token refresh

---

## 🔒 Google Cloud Console Setup

1. Create a new project or use existing
2. Enable Google Drive API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URIs:
   - `http://localhost:PORT/oauth/callback` (development)
   - `https://your.domain/oauth/callback` (production)
5. Copy Client ID and Client Secret to `.env`

---

✅ Deployment complete — PDF Service is now running like a service!