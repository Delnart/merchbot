## Frontend (TypeScript + Next.js)

Це фронтенд Telegram Mini App для MerchFICE.

### Локальний запуск

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Створіть `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Відкрийте http://localhost:3000.

### Локальний запуск через Telegram

Якщо хочете відкривати Mini App саме з Telegram, `localhost` не підійде. Потрібен публічний HTTPS-URL, наприклад через ngrok:

```bash
ngrok http 3000
```

Потім встановіть `WEBAPP_URL` у кореневому `.env` на HTTPS-адресу ngrok і, за потреби, `NEXT_PUBLIC_API_BASE_URL` також на публічний API-URL.

### Важливо

Застосунок повинен відкриватися через Telegram WebApp, інакше користувач побачить екран з вимогою відкрити Mini App у Telegram.

### Deploy

Для Render використовується кореневий `render.yaml`. Для фронтенду обов'язково задайте `NEXT_PUBLIC_API_BASE_URL` на URL API сервісу.
