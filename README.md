# Kovaak's aim tracker

This local dashboard reads Kovaak's CSV record files directly; it does not copy
or alter them. By default it uses:

`C:\Program Files (x86)\Steam\steamapps\common\FPSAimTrainer\FPSAimTrainer\stats`

## Run

```powershell
node server.js
```

Then open `http://localhost:4173`. Use **Refresh records** after a Kovaak's run.

If Kovaak's is installed elsewhere, start it with a custom folder:

```powershell
$env:KOVAAKS_STATS_DIR = 'D:\Steam\steamapps\common\FPSAimTrainer\FPSAimTrainer\stats'
node server.js
```

On first run (or if the folder can't be found), the app shows a **Set folder**
box to browse to your `...\FPSAimTrainer\stats` folder. The chosen path is saved
to `%APPDATA%\kovaaks-aim-tracker\config.json`.

## Build a single-file .exe (Windows)

```powershell
npm install
npm run build
```

This produces `dist\AimTracker.exe`. Double-click it — it starts the server on
`http://localhost:4173` and opens your browser automatically.

> Note: the `.exe` is a launcher; the dashboard still runs in your browser. The
> saved stats-folder path lives in `%APPDATA%\kovaaks-aim-tracker\config.json`,
> which is writable even when running from the packaged `.exe`.
