# Deployment Guide: WhatsApp Bulk Hub

Because this app uses Puppeteer (headless Chromium) and stores your WhatsApp session locally in `./.wwebjs_auth`, choose the deployment option that fits your setup:

---

## Option 1: Render / Railway / Koyeb (Recommended Cloud)

### Render.com:
1. Push your code to GitHub.
2. In Render, select **New + Web Service** -> Connect your GitHub repo.
3. Under **Environment**, choose **Docker** (Render will automatically detect the included [`Dockerfile`](file:///d:/sharief/whatsApp/Dockerfile)).
4. Add a **Persistent Disk** mounted at:
   - **Mount Path**: `/usr/src/app/.wwebjs_auth`
   - *Size*: 1 GB (ensures your WhatsApp login session stays remembered when the service restarts).
5. Click **Create Web Service**.

### Railway.app:
1. Connect your GitHub repository.
2. Railway detects the `Dockerfile` automatically.
3. Under **Volumes**, add a volume mounted to `/usr/src/app/.wwebjs_auth`.

---

## Option 2: VPS (DigitalOcean / AWS EC2 / Ubuntu / Hostinger)

1. **Clone repository on the server**:
   ```bash
   git clone <your-repo-url>
   cd whatsApp
   ```

2. **Install Node.js & system Chrome dependencies**:
   ```bash
   sudo apt update
   sudo apt install -y chromium-browser nodejs npm
   ```

3. **Install dependencies & PM2 process manager**:
   ```bash
   npm install
   sudo npm install -g pm2
   ```

4. **Start the application with PM2**:
   ```bash
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser pm2 start server.js --name "whatsapp-hub"
   pm2 startup
   pm2 save
   ```

5. Access via: `http://<YOUR_SERVER_IP>:3000`

---

## Option 3: Local / Office Network (Self-Hosted on Windows)

If you prefer keeping it running on this computer for your team:
1. Install PM2:
   ```bash
   npm install -g pm2
   ```
2. Start the service:
   ```bash
   pm2 start server.js --name "whatsapp-hub"
   ```
3. Share your local IP address (e.g., `http://192.168.1.X:3000`) with colleagues on the same Wi-Fi.
