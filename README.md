# MerchFICE — Telegram Mini App Store

MerchFICE — це сучасниий магазин мерчу у форматі Telegram Mini App. Він поєднує зручний клієнтський інтерфейс (каталог, кошик, оформлення замовлення) та потужну адмін-панель для управління товарами та реквізитами прямо в Telegram.

## Основний функціонал

*   **Telegram WebApp (Mini App):**
    *   **Каталог товарів:** Перегляд активних товарів, вибір розмірів та кольорів (напр. Білий або Чорний) зі зміною фото.
    *   **Кошик:** Збереження обраних товарів, керування кількістю.
    *   **Оформлення замовлення (Checkout):** Збір контактних даних, вибір способу доставки (Самовивіз, Нова Пошта), завантаження чеку або квитанції про оплату.
*   **Адмін-панель (через WebApp):**
    *   **Управління товарами:** Додавання, редагування, архівування товарів.
    *   **Опції товарів:** Встановлення різних розмірів та цін, вмикання опції "Колір" (з можливістю завантаження окремого фото для чорного і білого кольорів).
    *   **Налаштування:** Зміна реквізитів (Mono Банка або IBAN/Картка), контактів підтримки на льоту.
*   **Telegram Bot (Aiogram):**
    *   **Сповіщення:** Миттєве повідомлення в прив'язану адмін-групу (@чат) про нове замовлення.
    *   **Управління замовленнями:** Inline-кнопки в адмін чаті для зміни статусів (В обробці → Оплачено → Відправлено).
    *   **Зворотний зв'язок:** Бот автоматично повідомляє клієнта в ПП про кожну зміну статусу замовлення.

## Структура проекту

*   `app/main.py` — Точка входу FastAPI та Aiogram Webhook.
*   `app/webapp_api.py` — REST API для фронтенду інтерактивного Mini App.
*   `app/bot/` — Логіка Telegram-бота (роутери, повідомлення, команди).
*   `app/services/` — Бізнес-логіка (робота з товарами, замовленнями, базою даних).
*   `app/db/` — Моделі бази даних (SQLAlchemy).
*   `frontend/` — Frontend на TypeScript + Next.js для Telegram Mini App.

## Локальний запуск (Development)

1. Клонуйте репозиторій та перейдіть у папку проекту.
2. Встановіть залежності:
   ```bash
   pip install -r requirements.txt
   ```
3. Створіть файл `.env` (використайте `.env.example` як шаблон) та вкажіть ваш `BOT_TOKEN`, `DATABASE_URL` тощо. Для локального тестування можна використовувати SQLite:
   ```env
   DATABASE_URL=sqlite+aiosqlite:///merch.db
   ```
4. Запустіть бекенд:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
5. Запустіть фронтенд:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
6. Для локального фронтенду додайте змінну `NEXT_PUBLIC_API_BASE_URL` у `frontend/.env.local`:
    ```env
    NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
    ```

### Локальний запуск через ngrok

Telegram Mini App і webhook API мають бути доступні по публічному HTTPS, тому для повного локального тесту зазвичай потрібен ngrok або аналог.

1. Запустіть бекенд і фронтенд локально.
2. Підніміть два тунелі:
    * `ngrok http 8000` для API/Webhook.
    * `ngrok http 3000` для Frontend/Mini App.
3. В `.env` встановіть:
    * `APP_BASE_URL` = HTTPS-адреса ngrok для API.
    * `WEBAPP_URL` = HTTPS-адреса ngrok для фронтенду.
4. У `frontend/.env.local` залиште `NEXT_PUBLIC_API_BASE_URL` як локальний API або теж вкажіть HTTPS ngrok-URL, якщо хочете повністю тестувати через Telegram.
5. Після зміни `APP_BASE_URL` виконайте `/setup/webhook`, щоб Telegram почав слати оновлення на новий публічний URL.

## Запуск через Docker

1. Створіть `.env` у корені проєкту (можна скопіювати з `.env.example`) і заповніть мінімум:
    * `BOT_TOKEN`
    * `WEBHOOK_SECRET`
    * `APP_BASE_URL` (для локального запуску можна `http://localhost:8000`)
    * `WEBAPP_URL` (для локального запуску можна `http://localhost:3000`)
2. Запустіть стек:
    ```bash
    docker compose up --build
    ```
3. Сервіси будуть доступні:
    * API: `http://localhost:8000`
    * Frontend: `http://localhost:3000`
    * PostgreSQL: `localhost:5432`

## Деплой на Render

У репозиторії додано `render.yaml` з двома сервісами: API (Python) і Frontend (Next.js).

1. Імпортуйте репозиторій у Render як Blueprint.
2. Вкажіть змінні середовища для API:
    *   `BOT_TOKEN`: Токен вашого бота від @BotFather
    *   `WEBHOOK_SECRET`: Будь-який секретний рядок для захисту вебхуків
    *   `DATABASE_URL`: Строка підключення до PostgreSQL (наприклад, Neon або Supabase)
     *   `APP_BASE_URL`: URL API-сервісу Render (напр. `https://merchfice-api.onrender.com`)
     *   `WEBAPP_URL`: URL фронтенд-сервісу Render (напр. `https://merchfice-frontend.onrender.com`)
     *   `ADMIN_OWNER_IDS`: Telegram user id власників через кому (тільки ці id можуть виконати `/bind_admin_chat`)
     *   `BROADCAST_DELAY_MS`: затримка між повідомленнями у розсилці (рекомендовано 100)
3. Вкажіть змінну `NEXT_PUBLIC_API_BASE_URL` для фронтенд-сервісу (URL API з кроку 2).
4. Після деплою API перейдіть на `https://<api-domain>/setup/webhook` для реєстрації webhook.

## Better Stack Uptime

Автоматично зареєструвати монітор через код неможливо без доступу до вашого акаунта Better Stack, тому зробіть це вручну:

1. Увійдіть на https://betterstack.com/uptime.
2. Створіть Monitor з URL `https://<api-domain>/health`.
3. Interval: `5 minutes`.
4. Regions: залиште тільки європейські регіони (прибрати всі не-Європа).
5. Увімкніть email alerts.

## Адміністрування (Перший запуск)

1. Додайте вашого бота в групу, де мають сидіти менеджери (адміни).
2. Надішліть у групі команду `/bind_admin_chat` з акаунта, який входить у `ADMIN_OWNER_IDS`.
3. Тепер будь-який користувач із цієї групи зможе відкрити "Адмін Панель" через інтерфейс WebApp бота і керувати магазином.

---
*Розроблено спеціально для MerchFICE*
