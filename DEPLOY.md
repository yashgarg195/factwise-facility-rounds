# Deploy FeverTrack (free tier)

The app is a static site (`output: "export"`). It has no server and no database. The build writes the `out/` folder.

## Step 1: Put the code on GitHub (on the other device)

1. Unzip `FactWise-TPM-Yash-Garg.zip`. Open the folder `factwise-quarantine-app`.
2. Create an empty GitHub repository, for example `factwise-quarantine`. Do not add a README.
3. In the `factwise-quarantine-app` folder, run these commands. Replace `YOUR-USER` with your GitHub user name.

```bash
git init
git add .
git commit -m "FeverTrack prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USER/factwise-quarantine.git
git push -u origin main
```

## Option A: Vercel (recommended)

1. Go to https://vercel.com and sign in with GitHub.
2. Click **Add New → Project**. Import the repository.
3. Set **Project Name** to `factwise-quarantine-yash`. The URL is then https://factwise-quarantine-yash.vercel.app.
4. Keep the defaults (Framework Preset: Next.js). Click **Deploy**.
5. Open the URL in a private window. Do the 3-step demo in `README.md`.

If the name is not available, use a different name. Then change the link in the answers PDF. Edit `answers.html` in the `submission-src` folder of the zip, and follow `HOW-TO-REBUILD-PDF.txt` in the same folder.

## Option B: Render (Static Site)

1. Go to https://render.com and sign in with GitHub.
2. Click **New → Static Site**. Select the repository.
3. Build command: `npm install && npm run build`
4. Publish directory: `out`
5. Click **Create Static Site**. The URL is `https://NAME.onrender.com`.

A Render static site does not sleep on the free tier.

## Check before you submit

- The page opens in a new private window.
- The nurse view shows "Next up · 1 · Asha Verma".
- The full demo ends at 73/74 beds and 1 free bed.
