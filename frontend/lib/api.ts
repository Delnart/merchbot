// ── Types ─────────────────────────────────────────────────────────────────

export type CatalogSize = {
  size: string;
  price: number;
};

export type CatalogProduct = {
  id: number;
  title: string;
  description: string;
  photo_url: string | null;
  photo_black_url: string | null;
  requires_color: boolean;
  min_price: number;
  sizes: CatalogSize[];
  is_active?: boolean;
};

export type CartItem = {
  id: number;
  product_id: number;
  title: string;
  size: string;
  color: string | null;
  price: number;
  quantity: number;
  line_total: number;
  photo_url: string | null;
};

export type CartResponse = {
  items: CartItem[];
  total: number;
};

export type Recipient = {
  id: number;
  full_name: string;
  phone: string;
  is_default: boolean;
};

export type Order = {
  id: number;
  status: 'pending' | 'in_process' | 'completed' | 'cancelled';
  total_amount: number;
  created_at: string;
  delivery_method: string | null;
  address: string;
};

export type ShopConfig = {
  currency: string;
  mono_jar_url: string;
  card_number: string | null;
  is_dayf_delivery_enabled: boolean;
};

// ── API Client ────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private readonly baseUrl: string;
  private readonly initData: string;

  constructor(initData: string) {
    this.baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    this.initData = initData;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers ?? {});
    if (this.initData) {
      headers.set('X-Telegram-Init-Data', this.initData);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });

    if (response.status === 401) {
      throw new ApiError('open_via_telegram_required', 401);
    }
    if (!response.ok) {
      let detail = `http_${response.status}`;
      try {
        const payload = (await response.json()) as { detail?: string };
        if (payload.detail) detail = payload.detail;
      } catch {
        // ignore
      }
      throw new ApiError(detail, response.status);
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  // ── Catalog ──────────────────────────────────────────────────────────────
  getCatalog(): Promise<{ products: CatalogProduct[] }> {
    return this.request('/api/catalog');
  }

  getProduct(productId: number): Promise<CatalogProduct> {
    return this.request(`/api/catalog/${productId}`);
  }

  getConfig(): Promise<ShopConfig> {
    return this.request('/api/config');
  }

  // ── Cart ─────────────────────────────────────────────────────────────────
  getCart(): Promise<CartResponse> {
    return this.request('/api/cart');
  }

  addToCart(productId: number, size: string, color?: string | null, quantity = 1): Promise<{ ok: boolean }> {
    return this.request('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, size, color: color ?? null, quantity }),
    });
  }

  updateCartItem(itemId: number, quantity: number): Promise<{ ok: boolean }> {
    return this.request(`/api/cart/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
  }

  removeCartItem(itemId: number): Promise<{ ok: boolean }> {
    return this.request(`/api/cart/${itemId}`, { method: 'DELETE' });
  }

  clearCart(): Promise<{ ok: boolean }> {
    return this.request('/api/cart', { method: 'DELETE' });
  }

  // ── Recipients ────────────────────────────────────────────────────────────
  getRecipients(): Promise<{ recipients: Recipient[] }> {
    return this.request('/api/recipients');
  }

  createRecipient(data: {
    full_name: string;
    phone: string;
    is_default?: boolean;
  }): Promise<{ id: number; ok: boolean }> {
    return this.request('/api/recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  setDefaultRecipient(id: number): Promise<{ ok: boolean }> {
    return this.request(`/api/recipients/${id}/set-default`, { method: 'POST' });
  }

  deleteRecipient(id: number): Promise<{ ok: boolean }> {
    return this.request(`/api/recipients/${id}`, { method: 'DELETE' });
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  getOrders(): Promise<{ orders: Order[] }> {
    return this.request('/api/orders');
  }

  // ── Checkout ──────────────────────────────────────────────────────────────
  checkout(formData: FormData): Promise<{ ok: boolean; order_id: number }> {
    return this.request('/api/checkout', { method: 'POST', body: formData });
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  checkAdmin(): Promise<{ is_admin: boolean }> {
    return this.request('/api/admin/check');
  }

  getAdminProducts(): Promise<{ products: CatalogProduct[] }> {
    return this.request('/api/admin/products');
  }

  createProduct(data: {
    title: string;
    description: string;
    requires_color: boolean;
    sizes: Record<string, number>;
  }): Promise<{ id: number; ok: boolean }> {
    return this.request('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  updateProduct(
    id: number,
    data: {
      title: string;
      description: string;
      requires_color: boolean;
      sizes: Record<string, number>;
    },
  ): Promise<{ ok: boolean }> {
    return this.request(`/api/admin/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  uploadProductPhoto(id: number, formData: FormData): Promise<{ ok: boolean; photo_url: string }> {
    return this.request(`/api/admin/products/${id}/photo`, { method: 'POST', body: formData });
  }

  uploadProductBlackPhoto(
    id: number,
    formData: FormData,
  ): Promise<{ ok: boolean; photo_black_url: string }> {
    return this.request(`/api/admin/products/${id}/photo_black`, { method: 'POST', body: formData });
  }

  toggleProduct(id: number): Promise<{ ok: boolean; is_active: boolean }> {
    return this.request(`/api/admin/products/${id}/toggle`, { method: 'POST' });
  }
}

export function buildApiClient(initData: string): ApiClient {
  return new ApiClient(initData);
}

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');

export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (!API_BASE_URL) return url;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return `${API_BASE_URL}/${url}`;
}

export type { ApiClient };