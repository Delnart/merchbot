export function isValidUaPhone(value: string): boolean {
  const cleaned = value.replace(/[\s\-()]/g, '');
  return /^(\+?380|0)\d{9}$/.test(cleaned);
}

export function parseSizesInput(input: string): Record<string, number> {
  const output: Record<string, number> = {};
  const chunks = input.split(',').map(c => c.trim()).filter(Boolean);

  if (chunks.length === 0) {
    throw new Error('Додайте хоча б один розмір');
  }

  for (const chunk of chunks) {
    const colonIdx = chunk.indexOf(':');
    if (colonIdx === -1) {
      throw new Error('Невірний формат. Приклад: S:500, M:550');
    }
    const rawSize = chunk.slice(0, colonIdx).trim();
    const rawPrice = chunk.slice(colonIdx + 1).trim();

    if (!rawSize) throw new Error('Назва розміру не може бути порожньою');

    const price = Number.parseFloat(rawPrice);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Некоректна ціна для розміру ${rawSize}`);
    }
    output[rawSize.toUpperCase()] = price;
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
    not_admin: 'Немає доступу до адмінки.',
    no_admin_chat: 'Адмін-чат не налаштований.',
    empty_cart: 'Кошик порожній.',
    user_not_found: 'Користувача не знайдено.',
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
export async function compressImage(file: File, maxSize = 1200): Promise<File> {
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
              resolve(new File([blob], 'image.jpg', { type: 'image/jpeg' }));
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