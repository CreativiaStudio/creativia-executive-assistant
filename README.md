# Creativia Executive Assistant (Cloud)

Questo mini-progetto trasforma Antigravity in un **assistente esecutivo tascabile** sempre attivo nel Cloud di Google, accessibile dal tuo smartphone anche quando il portatile è spento nella borsa.

---

## 🚀 COME ATTIVARLO NEL CLOUD (Passo-Passo)

### 1. Inizializza Git e Pubblica su GitHub (Privato)
Apri un terminale nella cartella `creativia-executive-assistant` (oppure usa GitHub Desktop):

```bash
git init
git add .
git commit -m "feat: initial commit for cloud executive assistant"
```

Crea un nuovo repository **PRIVATO** sul tuo account GitHub chiamato `creativia-executive-assistant`:
```bash
git remote add origin https://github.com/<tuo-utente-github>/creativia-executive-assistant.git
git branch -M main
git push -u origin main
```

*(Nota: il file `.env` è escluso dal gitignore per sicurezza, quindi i tuoi token non finiscono in chiaro).*

---

### 2. Crea il Remote Project in Antigravity

1. Nell'app Antigravity (o da browser su **[antigravity.google.com](https://antigravity.google.com)**):
   - Clicca sull'icona della cartella con il simbolo cloud (**New Remote Project**) accanto a *Projects*.
2. Seleziona **GitHub** e scegli il repository privato appena creato: `creativia-executive-assistant`.
3. Nelle impostazioni del progetto (Environment Variables / Secrets), aggiungi:
   - `SUPABASE_URL`: `https://ekfnekrjpumjpetzgwzy.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` *(trovi la chiave completa nel tuo `.env.local`)*
4. Avvia la sessione!

---

### 3. Usalo dal Cellulare!

Apri **[antigravity.google.com](https://antigravity.google.com)** dal browser del telefono e seleziona il progetto `creativia-executive-assistant`.

Puoi scrivergli o dettargli a voce:
- *"Segna per Cocoora di rivedere il menu e la landing entro venerdì"*
- *"Ho appena finito con Simone di Cocoora: nota che è convinto sulla PWA ma vuole aspettare per il Club"*
- *"Fissami una call con Alfonso di Proggecta mercoledì alle 15:00 su Calendar"*
- *"Cosa abbiamo aperto per Oroeco?"*

L'agente scriverà direttamente nel database Supabase di Creativia Hub e nel tuo Google Calendar!
