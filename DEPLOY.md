# Deploy Facility Rounds (free tier)

The app is a static site (`output: "export"`). It has no server and no database. The build writes the `out/` folder.

## Use the GitHub repository

Import the `main` branch of [factwise-facility-rounds](https://github.com/yashgarg195/factwise-facility-rounds) into your hosting provider. To run the same source on another device, clone the repository:

```bash
git clone https://github.com/yashgarg195/factwise-facility-rounds.git
cd factwise-facility-rounds
npm ci
npm run dev
```

## Option A: Vercel (recommended)

1. Go to https://vercel.com and sign in with GitHub.
2. Click **Add New → Project**. Import the repository.
3. Use `factwise-facility-rounds` as the project name if available.
4. Keep the defaults (Framework Preset: Next.js). Click **Deploy**.
5. Copy the production URL from Vercel. Open it in a private window and do the three-step demo in `README.md`.

Add the verified production URL to the assessment answers PDF.

## Option B: Render (Static Site)

1. Go to https://render.com and sign in with GitHub.
2. Click **New → Static Site**. Select the repository.
3. Build command: `npm ci && npm run build`
4. Publish directory: `out`
5. Click **Create Static Site**. The URL is `https://NAME.onrender.com`.

A Render static site does not sleep on the free tier.

## Check before you submit

- The page opens in a new private window.
- The nurse view shows "Next up · 1 · Asha Verma".
- The full demo ends at 73/74 beds and 1 free bed.
