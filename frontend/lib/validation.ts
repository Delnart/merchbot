export function isValidUaPhone(value: string): boolean {
  const cleaned = value.replace(/[\s-]/g, "");
  return /^(\+?380|0)\d{9}$/.test(cleaned);
}

export function parseSizesInput(input: string): Record<string, number> {
  const output: Record<string, number> = {};
  for (const chunk of input.split(",")) {
    const [rawSize, rawPrice] = chunk.trim().split(":");
    if (!rawSize || !rawPrice) {
      throw new Error("Невірний формат розмірів. Приклад: S:500, M:550");
    }

    const size = rawSize.trim().toUpperCase();
    const price = Number.parseFloat(rawPrice.trim());

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Некоректна ціна для розміру ${size}`);
    }

    output[size] = price;
  }

  if (Object.keys(output).length === 0) {
    throw new Error("Додайте хоча б один розмір");
  }

  return output;
}

export function humanizeApiError(error: unknown): string {
  if (!(error instanceof Error)) return "Невідома помилка";

  const map: Record<string, string> = {
    open_via_telegram_required: "Відкрийте Mini App через Telegram.",
    invalid_size: "Обраний розмір недоступний.",
    invalid_quantity: "Некоректна кількість.",
    recipient_not_found: "Отримувача не знайдено.",
    recipient_info_required: "Заповніть дані отримувача.",
    invalid_delivery_method: "Оберіть спосіб доставки.",
    address_required: "Вкажіть адресу для Нової Пошти.",
    product_not_found: "Товар не знайдено.",
    not_admin: "Немає доступу до адмінки.",
    no_admin_chat: "Адмін-чат не налаштований.",
  };

  return map[error.message] ?? `Помилка: ${error.message}`;
}
