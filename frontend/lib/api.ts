// ── Types ─────────────────────────────────────────────────────────────────

export type CatalogVariant = {
  size: string;
  color: string | null;
  price: number;
  quantity: number | null;
  reserved: number;
};

export type CatalogProduct = {
  id: number;
  title: string;
  description: string;
  photo_url: string | null;
  photo_black_url: string | null;
  requires_color: boolean;
  min_price: number;
  variants: CatalogVariant[];
  is_active?: boolean;
  group_ids?: number[];
};

export type GroupMember = {
  id: number;
  telegram_id: number | null;
  username: string | null;
};

export type UserGroup = {
  id: number;
  name: string;
  members: GroupMember[];
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
  available_quantity: number | null;
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
  status: 'pending' | 'in_process' | 'ready_for_pickup' | 'completed' | 'cancelled';
  total_amount: number;
  created_at: string;
  delivery_method: string | null;
  address: string;
  pickup_slot_id?: number | null;
  pickup_slot_label?: string | null;
  needs_individual_pickup?: boolean;
};

export type ShopConfig = {
  currency: string;
  mono_jar_url: string;
  card_number: string | null;
  is_dayf_delivery_enabled: boolean;
}

export type PickupSlot = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  is_active?: boolean;
};;

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
        const payload = (await response.json()) as { detail?: unknown };
        // FastAPI validation errors (422) send detail as an array of objects
        if (typeof payload.detail === 'string' && payload.detail) detail = payload.detail;
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
  startCheckout(): Promise<{ ok: boolean }> {
    return this.request('/api/checkout/start', { method: 'POST' });
  }

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
    variants: Omit<CatalogVariant, 'reserved'>[];
    group_ids?: number[];
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
      variants: Omit<CatalogVariant, 'reserved'>[];
      group_ids?: number[];
    },
  ): Promise<{ ok: boolean }> {
    return this.request(`/api/admin/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  // ── Admin: user groups ────────────────────────────────────────────────────
  getAdminGroups(): Promise<{ groups: UserGroup[] }> {
    return this.request('/api/admin/groups');
  }

  createGroup(name: string): Promise<{ id: number; ok: boolean }> {
    return this.request('/api/admin/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  deleteGroup(id: number): Promise<{ ok: boolean; archived_products: number }> {
    return this.request(`/api/admin/groups/${id}`, { method: 'DELETE' });
  }

  addGroupMembers(id: number, values: string): Promise<{ ok: boolean; added: number }> {
    return this.request(`/api/admin/groups/${id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
  }

  removeGroupMember(groupId: number, memberId: number): Promise<{ ok: boolean }> {
    return this.request(`/api/admin/groups/${groupId}/members/${memberId}`, { method: 'DELETE' });
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

  // ── Pickup Slots ──────────────────────────────────────────────────────────
  getAdminPickupSlots(): Promise<{ slots: PickupSlot[] }> {
    return this.request('/api/admin/pickup-slots');
  }

  createPickupSlot(data: { date: string; start_time: string; end_time: string }): Promise<{ id: number; ok: boolean }> {
    return this.request('/api/admin/pickup-slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  deletePickupSlot(id: number): Promise<{ ok: boolean }> {
    return this.request(`/api/admin/pickup-slots/${id}`, { method: 'DELETE' });
  }

  getPickupSlots(): Promise<{ slots: PickupSlot[] }> {
    return this.request('/api/pickup-slots');
  }

  selectPickupSlot(orderId: number, data: { pickup_slot_id: number | null; needs_individual_pickup: boolean }): Promise<{ ok: boolean }> {
    return this.request(`/api/orders/${orderId}/pickup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
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