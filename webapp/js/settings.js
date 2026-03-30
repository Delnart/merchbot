/**
 * Settings module — manage recipients.
 */
const settings = {
    recipients: [],
    orders: [],

    async load() {
        const container = document.getElementById('settingsContent');
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            const [data, ordersData] = await Promise.all([
                api.getRecipients(),
                api.getOrders()
            ]);
            this.recipients = data.recipients;
            this.orders = ordersData.orders;
            this.render();
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-text">Помилка завантаження</div></div>`;
        }
    },

    render() {
        const container = document.getElementById('settingsContent');

        container.innerHTML = `
            <div class="section-title">Збережені отримувачі</div>
            ${this.recipients.length ? `
                <div class="card" style="margin-bottom:16px">
                    ${this.recipients.map((r, i) => `
                        ${i > 0 ? '<div class="divider"></div>' : ''}
                        <div class="recipient-card">
                            <div class="recipient-info">
                                <div class="recipient-name">${this._esc(r.full_name)}</div>
                                <div class="recipient-phone">${this._esc(r.phone)}</div>
                            </div>
                            ${r.is_default 
                                ? '<span class="default-badge">За замовч.</span>'
                                : `<button class="btn-secondary btn-small" onclick="settings.setDefault(${r.id})">Обрати</button>`
                            }
                            <button class="remove-btn" onclick="settings.remove(${r.id})">✕</button>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <div class="section-title">Історія замовлень</div>
            ${this.orders && this.orders.length ? `
                <div class="card" style="margin-bottom:16px;">
                    ${this.orders.map((o, i) => `
                        ${i > 0 ? '<div class="divider"></div>' : ''}
                        <div style="padding:12px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                                <b>Замовлення #${o.id}</b>
                                <span style="color:var(--text-secondary);font-size:0.85rem">${o.created_at.split('T')[0]}</span>
                            </div>
                            <div style="font-size:0.88rem;margin-bottom:4px">
                                Доставка: ${o.delivery_method === 'nova_poshta' ? 'Нова Пошта ' + this._esc(o.address) : 'На DayF'}
                            </div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
                                <span style="font-weight:600">${o.total_amount} грн</span>
                                <span style="font-size:0.8rem;padding:4px 8px;border-radius:4px;background:var(--bg-color)">
                                    ${this._getStatusLabel(o.status)}
                                </span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : '<div class="empty-state" style="padding:20px 0; margin-bottom:16px;"><div class="empty-text">Ви ще не робили замовлень</div></div>'}

            <div class="section-title">Додати отримувача</div>
            <div class="card" style="padding:14px">
                <div class="form-group">
                    <label class="form-label">ПІБ (По-батькові не обов'язково)</label>
                    <input class="form-input" id="settingsName" placeholder="Прізвище Ім'я">
                </div>
                <div class="form-group">
                    <label class="form-label">Номер телефону</label>
                    <input class="form-input" id="settingsPhone" type="tel" placeholder="+380... або 0...">
                </div>
                <button class="btn-primary" onclick="settings.addRecipient()">Додати</button>
            </div>
        `;
    },

    async addRecipient() {
        const name = document.getElementById('settingsName').value.trim();
        const phone = document.getElementById('settingsPhone').value.trim();
        if (!name || !phone) { app.showToast('Заповніть всі поля'); return; }
        
        const phoneRegex = /^(\+?380|0)\d{9}$/;
        if (!phoneRegex.test(phone.replace(/[\s-]/g, ''))) {
            app.showToast('Невірний формат телефону (напр. +380... або 0...)');
            return;
        }

        try {
            await api.createRecipient({ full_name: name, phone: phone });
            app.showToast('Отримувача додано');
            await this.load();
        } catch (e) { app.showToast('Помилка'); }
    },

    async setDefault(id) {
        try {
            await api.setDefaultRecipient(id);
            app.showToast('Отримувача обрано');
            await this.load();
        } catch (e) { app.showToast('Помилка'); }
    },

    async remove(id) {
        try {
            await api.deleteRecipient(id);
            app.showToast('Видалено');
            await this.load();
        } catch (e) { app.showToast('Помилка'); }
    },

    _esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; },
    _getStatusLabel(st) {
        const labels = {
            'pending': 'Очікує',
            'in_process': 'В роботі',
            'completed': 'Виконано',
            'cancelled': 'Скасовано'
        };
        return labels[st] || st;
    }
};
