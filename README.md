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
