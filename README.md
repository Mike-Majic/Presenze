# Presenze

Versione aggiornata con:
- login/registrazione con Supabase
- richiesta AIUTO verso admin tramite Edge Function
- richiesta reset password verso admin tramite Edge Function
- cooldown server side di 48 ore sulle richieste reset password

## Setup rapido lato Supabase

### 1. SQL
Esegui in Supabase SQL Editor il file:

`supabase/sql/2026-03-10_support_requests.sql`

### 2. Secrets Edge Functions
Imposta questi secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ADMIN_NOTIFY_EMAIL`
- `APP_NAME`

Esempio:

```bash
supabase secrets set SUPABASE_URL=https://TUO-PROGETTO.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=LA_TUA_SERVICE_ROLE_KEY
supabase secrets set RESEND_API_KEY=LA_TUA_RESEND_API_KEY
supabase secrets set ADMIN_NOTIFY_EMAIL=m.colurci@gmail.com
supabase secrets set APP_NAME="Gestione Presenze"
```

## Nota su più progetti Supabase

Sì, puoi avere più progetti Supabase (es. Presenze e Magazzino), ma ogni app deve usare URL/chiavi del suo progetto.

Checklist rapida se login/reset non funzionano:
- In `app.js` e `users.js` verifica `SUPABASE_URL` e `SUPABASE_KEY` del progetto Presenze.
- In hosting/API verifica `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` del progetto Presenze (non Magazzino).
- Nelle Edge Functions (`reset-request`, `help-request`) verifica i secrets sul progetto Presenze.
