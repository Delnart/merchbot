export function isValidUaPhone(value: string): boolean {
  const cleaned = value.replace(/[\s\-()]/g, '');
  return /^(\+?380|0)\d{9}$/.test(cleaned);
}

import { CatalogVariant } from './api';

export function parseVariantsInput(input: string, requiresColor: boolean): Omit<CatalogVariant, 'reserved'>[] {
  let chunks: any[];
  try {
    chunks = JSON.parse(input);
  } catch (e) {
    throw new Error('Некоректний формат варіантів');
  }

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('Додайте хоча б один варіант');
  }

  const output: Omit<CatalogVariant, 'reserved'>[] = [];

  for (const chunk of chunks) {
    const size = chunk.size?.trim();
    if (!size) throw new Error('Назва розміру не може бути порожньою');

    const color = chunk.color?.trim();
    if (requiresColor && !color) {
      throw new Error(`Колір не може бути порожнім для розміру ${size}`);
    }

    const price = Number.parseFloat(chunk.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Некоректна ціна для розміру ${size}`);
    }

    const rawQty = chunk.quantity?.trim();
    const qty = rawQty ? Number.parseInt(rawQty, 10) : null;
    if (qty !== null && (Number.isNaN(qty) || qty < 0)) {
      throw new Error(`Некоректна кількість для розміру ${size}`);
    }

    output.push({
      size: size.toUpperCase(),
      color: requiresColor ? color : null,
      price,
      quantity: qty,
    });
  }

  return output;
}

export function humanizeApiError(error: unknown): string {
  if (!(error instanceof Error)) return 'Невідома помилка';

  const map: Record<string, string> = {
    open_via_telegram_required: 'Відкрийте Mini App через Telegram.',
    invalid_size: 'Обраний розмір недоступний.',
    invalid_quantity: 'Некоректна кількість.',
    recipient_not_found: 'Отримувача не знайдено.',
    recipient_info_required: 'Заповніть дані отримувача.',
    invalid_delivery_method: 'Оберіть спосіб доставки.',
    address_required: 'Вкажіть адресу для Нової Пошти.',
    product_not_found: 'Товар не знайдено.',
    product_not_available: 'Деякі товари з кошика більше недоступні для вас. Оновіть кошик.',
    too_many_requests: 'Забагато спроб. Зачекайте хвилину.',
    group_already_exists: 'Група з такою назвою вже існує.',
    group_not_found: 'Групу не знайдено.',
    not_admin: 'Немає доступу до адмінки.',
    no_admin_chat: 'Адмін-чат не налаштований.',
    empty_cart: 'Кошик порожній.',
    user_not_found: 'Користувача не знайдено.',
    file_too_large: 'Файл занадто великий. Будь ласка, оберіть фото меншого розміру (до 10 МБ).',
  };

  return map[error.message] ?? `Помилка: ${error.message}`;
}

export function deliveryLabel(method: string): string {
  const labels: Record<string, string> = {
    nova_poshta: 'Нова Пошта',
    campus: 'На DayF',
    dayf: 'DayF',
    later_campus: 'Пізніше в корпусі',
  };
  return labels[method] ?? method;
}

export function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Очікує',
    in_process: 'В роботі',
    completed: 'Виконано',
    cancelled: 'Скасовано',
  };
  return labels[status] ?? status;
}

/** Compress image before upload */
export async function compressImage(file: File, maxSize = 1200): Promise<File | Blob> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          blob => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.82,
        );
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}