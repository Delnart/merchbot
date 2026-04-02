/**
 * Checkout module — recipient selection, delivery, receipt upload, order submission.
 */
const checkout = {
    recipients: [],
    config: null,
    selectedRecipientId: null,
    selectedDelivery: null,
    receiptFile: null,

    async load() {
        const container = document.getElementById('checkoutContent');
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            const [recipientsData, configData, cartData] = await Promise.all([
                api.getRecipients(), api.getConfig(), api.getCart(),
            ]);
            this.recipients = recipientsData.recipients;
            this.config = configData;
            this.selectedRecipientId = null;
            this.selectedDelivery = null;
            this.receiptFile = null;

            if (!cartData.items.length) {
                container.innerHTML = `<div class="empty-state"><div class="empty-text">Кошик порожній</div>
                    <button class="btn-primary" style="max-width:240px;margin:0 auto" onclick="app.navigate('catalog')">До каталогу</button></div>`;
                return;
            }
            this.render(cartData);
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><div class="empty-text">Помилка завантаження</div></div>`;
        }
    },

    render(cartData) {
        const container = document.getElementById('checkoutContent');
        const defaultRec = this.recipients.find(r => r.is_default);

        container.innerHTML = `
            <div class="section-title">Ваше замовлення</div>
            <div class="card" style="margin-bottom:16px;padding:14px">
                ${cartData.items.map(i => `
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem">
                        <span>${this._esc(i.title)} (${i.size}${i.color ? ' - ' + i.color : ''}) ×${i.quantity}</span>
                        <span style="font-weight:600">${i.line_total} грн</span>
                    </div>
                `).join('')}
                <div class="divider" style="margin:10px 0"></div>
                <div style="display:flex;justify-content:space-between;font-weight:700">
                    <span>Разом</span>
                    <span>${cartData.total} грн</span>
                </div>
            </div>

            <div class="section-title">Отримувач</div>
            ${this.recipients.length ? `
                ${this.recipients.map(r => `
                    <div class="selection-card ${r.is_default ? 'selected' : ''}" 
                         onclick="checkout.selectRecipient(${r.id}, this)" data-recipient-id="${r.id}">
                        <div class="radio-dot"></div>
                        <div>
                            <div style="font-weight:600;font-size:0.88rem">${this._esc(r.full_name)}</div>
                            <div style="font-size:0.78rem;color:var(--text-secondary)">${this._esc(r.phone)}</div>
                        </div>
                        ${r.is_default ? '<span class="default-badge" style="margin-left:auto">За замовч.</span>' : ''}
                    </div>
                `).join('')}
                <div class="selection-card" onclick="checkout.selectNewRecipient(this)" id="newRecipientCard">
                    <div class="radio-dot"></div>
                    <div class="selection-card-text">Інший отримувач</div>
                </div>
            ` : ''}

            <div id="newRecipientForm" style="${this.recipients.length ? 'display:none' : ''}">
                <div class="form-group">
                    <label class="form-label">ПІБ отримувача (По-батькові не обов'язково)</label>
                    <input class="form-input" id="checkoutName" placeholder="Прізвище Ім'я">
                </div>
                <div class="form-group">
                    <label class="form-label">Номер телефону</label>
                    <input class="form-input" id="checkoutPhone" type="tel" placeholder="+380... або 0...">
                </div>
                <label class="checkbox-row">
                    <input type="checkbox" id="checkoutSaveRecipient" checked>
                    <span class="checkbox-label">Зберегти отримувача</span>
                </label>
            </div>

            <div class="section-title">Спосіб доставки</div>
            <div class="selection-card" onclick="checkout.selectDelivery('nova_poshta', this)">
                <div class="radio-dot"></div>
                <span class="selection-card-text">Нова Пошта</span>
            </div>
            <div class="selection-card" onclick="checkout.selectDelivery('campus', this)">
                <div class="radio-dot"></div>
                <span class="selection-card-text">На DayF</span>
            </div>
            ${this.config.is_dayf_delivery_enabled ? `
                <div class="selection-card" onclick="checkout.selectDelivery('dayf', this)">
                    <div class="radio-dot"></div>
                    <span class="selection-card-text">На DayF</span>
                </div>
            ` : ''}

            <div id="npAddressBlock" style="display:none">
                <div class="form-group">
                    <label class="form-label">Місто та номер відділення НП</label>
                    <input class="form-input" id="checkoutAddress" placeholder="Київ, відділення №5">
                </div>
            </div>

            <div class="section-title">Оплата</div>
            <div class="card" style="padding:14px;margin-bottom:16px">
                <div style="font-size:0.88rem;margin-bottom:8px">
                    Оплатіть <b>${cartData.total} грн</b> за посиланням:
                </div>
                <a href="${this.config.mono_jar_url}" target="_blank" class="btn-secondary" style="text-align:center;display:block;margin-bottom:10px">
                    Відкрити Банку Monobank
                </a>
                ${this.config.card_number ? `
                <div style="font-size:0.82rem; margin-top:10px; text-align:center;">
                    Або перекажіть на картку: <br>
                    <b style="user-select:all; font-size:1.1rem; display:block; margin-top:4px;">${this.config.card_number}</b>
                </div>
                ` : ''}
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:10px;text-align:center;">Після оплати завантажте скріншот квитанції</div>
            </div>

            <div class="section-title">Скріншот квитанції</div>
            <div class="file-upload-area" id="receiptUploadArea">
                <input type="file" accept="image/*" onchange="checkout.onReceiptSelected(event)" id="receiptInput">
                <div id="receiptPreviewContainer">
                    <div class="file-upload-icon">↑</div>
                    <div class="file-upload-text">Натисніть, щоб завантажити</div>
                </div>
            </div>

            <button class="btn-primary" id="checkoutSubmitBtn" onclick="checkout.submit()" style="margin-top:20px" disabled>
                Оформити замовлення
            </button>
        `;

        if (defaultRec) this.selectedRecipientId = defaultRec.id;
        this.validateForm();
    },

    selectRecipient(id, el) {
        document.querySelectorAll('#checkoutContent .selection-card[data-recipient-id]').forEach(c => c.classList.remove('selected'));
        document.getElementById('newRecipientCard')?.classList.remove('selected');
        el.classList.add('selected');
        this.selectedRecipientId = id;
        document.getElementById('newRecipientForm').style.display = 'none';
        this.validateForm();
    },

    selectNewRecipient(el) {
        document.querySelectorAll('#checkoutContent .selection-card[data-recipient-id]').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        this.selectedRecipientId = null;
        document.getElementById('newRecipientForm').style.display = 'block';
        this.validateForm();
    },

    selectDelivery(method, el) {
        document.querySelectorAll('#checkoutContent .selection-card').forEach(c => {
            if (c.onclick && c.onclick.toString().includes('selectDelivery')) c.classList.remove('selected');
        });
        el.classList.add('selected');
        this.selectedDelivery = method;
        document.getElementById('npAddressBlock').style.display = method === 'nova_poshta' ? 'block' : 'none';
        this.validateForm();
    },

    onReceiptSelected(e) {
        const file = e.target.files[0];
        if (!file) return;
        this.receiptFile = file;
        document.getElementById('receiptUploadArea').classList.add('has-file');
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('receiptPreviewContainer').innerHTML = `
                <img class="file-upload-preview" src="${ev.target.result}" alt="">
                <div class="file-upload-text" style="margin-top:8px">Фото завантажено</div>`;
        };
        reader.readAsDataURL(file);
        this.validateForm();
    },

    validateForm() {
        const btn = document.getElementById('checkoutSubmitBtn');
        if (!btn) return;
        const phoneInput = document.getElementById('checkoutPhone')?.value.trim() || '';
        const phoneValid = this.selectedRecipientId || /^(\+?380|0)\d{9}$/.test(phoneInput.replace(/[\s-]/g, ''));
        const hasRecipient = this.selectedRecipientId || (
            document.getElementById('checkoutName')?.value.trim() && phoneValid
        );
        const hasDelivery = !!this.selectedDelivery;
        const hasAddress = this.selectedDelivery !== 'nova_poshta' || 
                          document.getElementById('checkoutAddress')?.value.trim();
        const hasReceipt = !!this.receiptFile;
        btn.disabled = !(hasRecipient && hasDelivery && hasAddress && hasReceipt);
    },

    async submit() {
        const btn = document.getElementById('checkoutSubmitBtn');
        btn.disabled = true;
        btn.textContent = 'Оформлюємо...';

        try {
            const formData = new FormData();
            formData.append('delivery_method', this.selectedDelivery);
            const address = this.selectedDelivery === 'nova_poshta' 
                ? document.getElementById('checkoutAddress').value.trim()
                : (this.selectedDelivery === 'campus' ? 'На DayF' : 'На DayF');
            formData.append('delivery_address', address);

            if (this.selectedRecipientId) {
                formData.append('recipient_id', this.selectedRecipientId);
            } else {
                formData.append('recipient_name', document.getElementById('checkoutName').value.trim());
                formData.append('recipient_phone', document.getElementById('checkoutPhone').value.trim());
                formData.append('save_recipient', document.getElementById('checkoutSaveRecipient').checked);
            }
            formData.append('receipt_photo', this.receiptFile);

            const result = await api.checkout(formData);
            document.getElementById('successText').textContent = 
                `Замовлення #${result.order_id} прийнято. Ми перевіримо оплату та повідомимо вас.`;
            app.navigate('success');
            await cart.updateBadge();
        } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Оформити замовлення';
            app.showToast('Помилка: ' + e.message);
        }
    },

    _esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
};

document.addEventListener('input', (e) => {
    if (['checkoutName', 'checkoutPhone', 'checkoutAddress'].includes(e.target.id)) checkout.validateForm();
});
