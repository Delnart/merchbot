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
  status: string;
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

class ApiClient {
  private readonly baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  private readonly initData: string;

  constructor(initData: string) {
    this.initData = initData;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers ?? {});
    headers.set("X-Telegram-Init-Data", this.initData);

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });

    if (response.status === 401) {
      throw new Error("open_via_telegram_required");
    }
    if (!response.ok) {
      let detail = `http_${response.status}`;
      try {
        const payload = (await response.json()) as { detail?: string };
        if (payload.detail) detail = payload.detail;
      } catch {
        // ignore parse errors
      }
      throw new Error(detail);
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  getCatalog(): Promise<{ products: CatalogProduct[] }> {
    return this.request("/api/catalog");
  }

  getProduct(productId: number): Promise<CatalogProduct> {
    return this.request(`/api/catalog/${productId}`);
  }

  getCart(): Promise<CartResponse> {
    return this.request("/api/cart");
  }

  addToCart(productId: number, size: string, color?: string): Promise<{ ok: boolean }> {
    return this.request("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, size, color: color ?? null, quantity: 1 }),
    });
  }

  updateCartItem(itemId: number, quantity: number): Promise<{ ok: boolean }> {
    return this.request(`/api/cart/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
  }

  removeCartItem(itemId: number): Promise<{ ok: boolean }> {
    return this.request(`/api/cart/${itemId}`, { method: "DELETE" });
  }

  clearCart(): Promise<{ ok: boolean }> {
    return this.request("/api/cart", { method: "DELETE" });
  }

  getRecipients(): Promise<{ recipients: Recipient[] }> {
    return this.request("/api/recipients");
  }

  createRecipient(payload: { full_name: string; phone: string; is_default?: boolean }): Promise<{ id: number; ok: boolean }> {
    return this.request("/api/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  setDefaultRecipient(recipientId: number): Promise<{ ok: boolean }> {
    return this.request(`/api/recipients/${recipientId}/set-default`, { method: "POST" });
  }

  deleteRecipient(recipientId: number): Promise<{ ok: boolean }> {
    return this.request(`/api/recipients/${recipientId}`, { method: "DELETE" });
  }

  getOrders(): Promise<{ orders: Order[] }> {
    return this.request("/api/orders");
  }

  getConfig(): Promise<ShopConfig> {
    return this.request("/api/config");
  }

  checkout(formData: FormData): Promise<{ ok: boolean; order_id: number }> {
    return this.request("/api/checkout", { method: "POST", body: formData });
  }

  checkAdmin(): Promise<{ is_admin: boolean }> {
    return this.request("/api/admin/check");
  }

  getAdminProducts(): Promise<{ products: CatalogProduct[] }> {
    return this.request("/api/admin/products");
  }

  createProduct(payload: { title: string; description: string; requires_color: boolean; sizes: Record<string, number> }): Promise<{ id: number; ok: boolean }> {
    return this.request("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  updateProduct(productId: number, payload: { title: string; description: string; requires_color: boolean; sizes: Record<string, number> }): Promise<{ ok: boolean }> {
    return this.request(`/api/admin/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  uploadProductPhoto(productId: number, formData: FormData): Promise<{ ok: boolean; photo_url: string }> {
    return this.request(`/api/admin/products/${productId}/photo`, { method: "POST", body: formData });
  }

  uploadProductBlackPhoto(productId: number, formData: FormData): Promise<{ ok: boolean; photo_black_url: string }> {
    return this.request(`/api/admin/products/${productId}/photo_black`, { method: "POST", body: formData });
  }

  toggleProduct(productId: number): Promise<{ ok: boolean; is_active: boolean }> {
    return this.request(`/api/admin/products/${productId}/toggle`, { method: "POST" });
  }
}

export function buildApiClient(initData: string): ApiClient {
  return new ApiClient(initData);
}
