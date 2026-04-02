/**
 * Cart module — view, update quantities, remove items.
 */
const cart = {
    items: [],
    total: 0,

    async load() {
        const container = document.getElementById('cartContent');
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            const data = await api.getCart();
            this.items = data.items;
            this.total = data.total;
            this.render();
            this.updateBadge();
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-text">Помилка завантаження</div></div>`;
        }
    },

    render() {
        const container = document.getElementById('cartContent');
        
        if (!this.items.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">—</div>
                    <div class="empty-text">Ваш кошик порожній</div>
                    <button class="btn-primary" style="max-width:240px;margin:0 auto" onclick="app.navigate('catalog')">До каталогу</button>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="card" style="margin-bottom:12px">
                ${this.items.map(item => `
                    <div class="cart-item">
                        ${item.photo_url
                            ? `<img class="cart-item-image" src="${item.photo_url}" alt="">`
                            : `<div class="cart-item-image" style="display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:0.7rem">Фото</div>`
                        }
                        <div class="cart-item-info">
                            <div class="cart-item-title">${this._esc(item.title)}</div>
                            <div class="cart-item-size">Розмір: ${item.size}${item.color ? ' / Колір: ' + item.color : ''}</div>
                            <div class="cart-item-price">${item.line_total} грн</div>
                        </div>
                        <div class="cart-item-actions">
                            <div class="qty-control">
                                <button class="qty-btn" onclick="cart.updateQty(${item.id}, ${item.quantity - 1})">−</button>
                                <span class="qty-value">${item.quantity}</span>
                                <button class="qty-btn" onclick="cart.updateQty(${item.id}, ${item.quantity + 1})">+</button>
                            </div>
                            <button class="remove-btn" onclick="cart.removeItem(${item.id})">Видалити</button>
                        </div>
                    </div>
                    <div class="divider"></div>
                `).join('')}
                <div class="cart-total">
                    <span>Разом</span>
                    <span class="total-price">${this.total} грн</span>
                </div>
            </div>
            <button class="btn-primary" onclick="app.navigate('checkout')" style="margin-bottom:8px">Оформити замовлення</button>
            <button class="btn-secondary btn-danger" onclick="cart.clearAll()">Очистити кошик</button>
        `;
    },

    async updateQty(itemId, newQty) {
        if (newQty < 1) { await this.removeItem(itemId); return; }
        try { await api.updateCartItem(itemId, newQty); await this.load(); }
        catch (e) { app.showToast('Помилка'); }
    },

    async removeItem(itemId) {
        try { await api.removeCartItem(itemId); await this.load(); app.showToast('Видалено'); }
        catch (e) { app.showToast('Помилка'); }
    },

    async clearAll() {
        try { await api.clearCart(); await this.load(); app.showToast('Кошик очищено'); }
        catch (e) { app.showToast('Помилка'); }
    },

    async updateBadge() {
        try {
            const data = await api.getCart();
            const count = data.items.reduce((sum, i) => sum + i.quantity, 0);
            const badge = document.getElementById('cartBadge');
            if (count > 0) { badge.textContent = count; badge.style.display = 'flex'; }
            else { badge.style.display = 'none'; }
        } catch (e) {}
    },

    _esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
};
