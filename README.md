# Designer Portfolio (self-hosted)

Everyone who opens your website sees your works. Only you (with the PIN) can edit.
No `npm install` needed. Only Node.js 18 or newer.

## Run on your computer
    node server.js
Open http://localhost:3000 , click **Admin**, enter your PIN.

## PIN
No PIN is included in this folder (so it is never uploaded to GitHub by mistake).
- Local: `ADMIN_PIN=1998 node server.js`   (Windows cmd: `set ADMIN_PIN=1998 && node server.js`)
  or run `node set-pin.js 1998` once (creates config.json, which is in .gitignore).
- Online (Render/Railway): set the `ADMIN_PIN` environment variable. Use 6+ digits or a password.
- NEVER commit config.json to a public GitHub repo: a 4-digit PIN hash can be cracked in seconds.

## Where is my data?
Folder `storage/` : `data.json` (profile, works, skills...) and `uploads/` (photos, videos).
BACK THIS FOLDER UP. Set a different folder with `DATA_DIR=/path`.
Max upload size: 300 MB per file (`MAX_UPLOAD_MB=500` to change).
Allowed files: JPG, PNG, WebP, GIF, MP4, WebM, MOV.

## Put it online (pick one)
1. VPS (DigitalOcean, Hetzner, etc.) - easiest and cheapest long term
   - Install Node 18+, upload this folder, run: `PORT=3000 node server.js`
   - Keep it running: `npm i -g pm2 && pm2 start server.js --name portfolio && pm2 save`
   - Put Caddy or nginx in front for HTTPS + your domain (Caddy: `yourdomain.com { reverse_proxy localhost:3000 }`)
2. Render / Railway / Fly.io
   - Start command: `node server.js`
   - Set env var `DATA_DIR` pointing to a **persistent disk/volume**
     (without a persistent disk your uploads disappear on every deploy!)
Use HTTPS always, so the PIN is not sent in plain text.

## Features
- Admin login with server-side PIN (cookie, 7 days, 5 wrong tries = 1 minute lock)
- Works / AI videos / skills (with logos) / experience / education / cover / profile picture
- Live album slideshow, mobile friendly
- CV PDF export (button in admin bar)
- Unused uploads are deleted automatically (after 1 hour)

## Files
- server.js        backend (API + file storage)
- set-pin.js       change your PIN
- config.json      your PIN (hashed)
- public/index.html  the website
- package.json

## Deploy: GitHub -> Render
1. Put these files in a GitHub repo (PRIVATE is best). `public/index.html`, `server.js`,
   `package.json`, `render.yaml`, `.gitignore` must be there. Do not upload config.json or storage/.
2. render.com -> New -> Blueprint -> connect the repo. Render reads render.yaml.
3. Type your ADMIN_PIN when asked -> Apply. Wait for the deploy.
4. Open the https://YOURNAME.onrender.com link, click Admin, enter the PIN.
Uploads and data live on the 5 GB persistent disk mounted at /data (needs a paid Starter instance;
free instances lose uploads on every restart). Check render.com/pricing for current prices.
Each push to GitHub redeploys the site; your data on the disk stays.
Railway also works: add a Volume, mount it at /data, set DATA_DIR=/data and ADMIN_PIN.
GitHub Pages cannot run this server (it only hosts static files).
