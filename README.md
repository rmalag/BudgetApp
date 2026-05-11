# Budget Condiviso

PWA installabile per Android e iOS per gestire un budget condiviso in tempo reale.

## Cosa include

- Setup di piu conti con colore e saldo iniziale.
- Setup di categorie di entrata o uscita con colore.
- Modifica ed eliminazione di conti/categorie, con blocco eliminazione se la voce e gia usata in un movimento.
- Movimenti con tipo, importo, data, conto, categoria e note.
- Home con grafico a torta separato per entrate e uscite.
- Timespan giorno, settimana, mese, anno e periodo custom.
- Navigazione avanti/indietro nel timespan, con default sul giorno corrente.
- Dettaglio movimento con modifica ed eliminazione.
- Realtime multiutente tramite Firebase Firestore.
- Manifest e service worker per installazione PWA.

## Configurazione Firebase

1. Crea un progetto Firebase.
2. Abilita Firestore Database.
3. Abilita Authentication con provider Anonymous.
4. Pubblica le regole in `firestore.rules`.
5. Apri l'app e incolla la configurazione web Firebase, per esempio:

```json
{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "...",
  "appId": "..."
}
```

Usa lo stesso ID workspace su tutti i dispositivi che devono condividere il budget.

## Avvio locale

```powershell
node dev-server.js
```

Poi apri `http://127.0.0.1:4173/`.



### Avvio con HTTPS/SSL (Let’s Encrypt)

Per servire la PWA in HTTPS (es. per installazione su iOS o produzione) usando certificati standard come quelli di Let’s Encrypt:

1. Prepara i certificati SSL come `fullchain.pem` (catena completa) e `privkey.pem` (chiave privata) e mettili nella cartella `certs/` nella root del progetto.
2. Imposta queste variabili nel file `.env` o direttamente in Docker Compose:

   ```env
   SSL_KEY=/certs/privkey.pem
   SSL_CERT=/certs/fullchain.pem
   # SSL_CA non necessario con fullchain.pem
   ```

3. Avvia con Docker Compose normalmente:

   ```bash
   docker-compose up --build
   ```

Se le variabili SSL non sono impostate, il server parte in HTTP.

Esempio di struttura:

```
BudgetApp/
  certs/
    privkey.pem
    fullchain.pem
  ...
```

---

## Deployment con Docker

L'applicazione è containerizzata e pronta per il deployment su Portainer o altri orchestratori.

### Configurazione

1. Copia `.env.example` a `.env` e configura le variabili d'ambiente:

```bash
cp .env.example .env
```

2. Modifica `.env` con i tuoi dati Firebase e workspace ID:

```env
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id
WORKSPACE_ID=my_budget_workspace
```

### Build e avvio locale

```bash
# Build dell'immagine Docker
docker build -t budgetapp .

# Avvio del container
docker run -p 4173:4173 --env-file .env budgetapp
```

Poi accedi a `http://localhost:4173`.

### Deployment su Portainer

1. Clona il repository nel tuo server
2. Navigaopen in Portainer > Stacks > Add Stack
3. Seleziona "Docker Compose"
4. Copia il contenuto di `docker-compose.yml`
5. Aggiungi le variabili d'ambiente (vedi sopra)
6. Deploy lo stack

In alternativa, carica il file `docker-compose.yml` direttamente da Portainer.

### Variabili d'ambiente

- `FIREBASE_PROJECT_ID` **(required)** - Project ID da Firebase
- `FIREBASE_API_KEY` **(required)** - API Key da Firebase
- `FIREBASE_AUTH_DOMAIN` **(required)** - Auth domain da Firebase
- `FIREBASE_STORAGE_BUCKET` **(required)** - Storage bucket da Firebase
- `FIREBASE_MESSAGING_SENDER_ID` **(required)** - Messaging Sender ID da Firebase
- `FIREBASE_APP_ID` **(required)** - App ID da Firebase
- `FIREBASE_MEASUREMENT_ID` (optional) - Google Analytics ID
- `WORKSPACE_ID` **(required)** - ID workspace condiviso (alphanumerico, trattini ammessi)
- `PORT` (optional, default: 4173) - Porta di ascolto
- `HOST` (optional, default: 0.0.0.0) - Indirizzo di binding

## Le PNG delle icone

Le PNG delle icone sono rigenerabili con:

```powershell
node tools/generate-icons.js
```
