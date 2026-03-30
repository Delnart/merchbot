/**
 * API client for the Mini App.
 * Attaches Telegram initData to every request.
 */
class ApiClient {
    constructor() {
        this.baseUrl = '';
        this.initData = '';
        if (window.Telegram?.WebApp?.initData) {
            this.initData = window.Telegram.WebApp.initData;
        }
    }

    async _request(method, path, { body, isFormData } = {}) {
        const headers = {};
        if (this.initData) {
            headers['X-Telegram-Init-Data'] = this.initData;
        }
        if (!isFormData && body) {
            headers['Content-Type'] = 'application/json';
        }

        const opts = { method, headers };
        if (body) {
            opts.body = isFormData ? body : JSON.stringify(body);
        }

        const resp = await fetch(`${this.baseUrl}${path}`, opts);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${resp.status}`);
        }
        // Handle empty responses
        const text = await resp.text();
        return text ? JSON.parse(text) : {};
    }

    get(path) { return this._request('GET', path); }
    post(path, body) { return this._request('POST', path, { body }); }
    put(path, body) { return this._request('PUT', path, { body }); }
    patch(path, body) { return this._request('PATCH', path, { body }); }
    del(path) { return this._request('DELETE', path); }
    upload(path, formData) { return this._request('POST', path, { body: formData, isFormData: true }); }

    // ── Catalog
    getCatalog() { return this.get('/api/catalog'); }
    getProduct(id) { return this.get(`/api/catalog/${id}`); }
    getConfig() { return this.get('/api/config'); }

    // ── Cart
    getCart() { return this.get('/api/cart'); }
    addToCart(productId, size, qty = 1) { return this.post('/api/cart', { product_id: productId, size, quantity: qty }); }
    updateCartItem(id, qty) { return this.patch(`/api/cart/${id}`, { quantity: qty }); }
    removeCartItem(id) { return this.del(`/api/cart/${id}`); }
    clearCart() { return this.del('/api/cart'); }

    // ── Orders
    getOrders() { return this.get('/api/orders'); }

    // ── Recipients
    getRecipients() { return this.get('/api/recipients'); }
    createRecipient(data) { return this.post('/api/recipients', data); }
    updateRecipient(id, data) { return this.put(`/api/recipients/${id}`, data); }
    deleteRecipient(id) { return this.del(`/api/recipients/${id}`); }
    setDefaultRecipient(id) { return this.post(`/api/recipients/${id}/set-default`); }

    // ── Checkout
    checkout(formData) { return this.upload('/api/checkout', formData); }

    // ── Admin
    checkAdmin() { return this.get('/api/admin/check'); }
    getAdminProducts() { return this.get('/api/admin/products'); }
    createProduct(data) { return this.post('/api/admin/products', data); }
    updateProduct(id, data) { return this.put(`/api/admin/products/${id}`, data); }
    uploadProductPhoto(id, formData) { return this.upload(`/api/admin/products/${id}/photo`, formData); }
    toggleProduct(id) { return this.post(`/api/admin/products/${id}/toggle`); }
}

window.api = new ApiClient();
