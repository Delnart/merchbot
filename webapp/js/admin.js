/**
 * Admin module — product management.
 */
const admin = {
    products: [],
    currentProduct: null,

    async load() {
        const container = document.getElementById('adminContent');
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const data = await api.getAdminProducts();
            this.products = data.products;
            this.render();
        } catch (e) {
            if (e.message.includes('403') || e.message.includes('not_admin') || e.message.includes('no_admin_chat')) {
                container.innerHTML = `<div class="empty-state"><div class="empty-text">Немає доступу</div></div>`;
            } else {
                container.innerHTML = `<div class="empty-state"><div class="empty-text">Помилка завантаження</div></div>`;
            }
        }
    },

    render() {
        const container = document.getElementById('adminContent');
        container.innerHTML = `
            <button class="btn-primary" onclick="admin.openCreate()" style="margin-bottom:16px">Додати товар</button>
            ${this.products.length ? `
                <div class="card">
                    ${this.products.map((p, i) => `
                        ${i > 0 ? '<div class="divider"></div>' : ''}
                        <div class="admin-product-item" onclick="admin.openEdit(${p.id})">
                            ${p.photo_url
                                ? `<img class="admin-product-image" src="${p.photo_url}" alt="">`
                                : `<div class="admin-product-image" style="display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:0.7rem">Фото</div>`
                            }
                            <div class="admin-product-info">
                                <div class="admin-product-title">${this._esc(p.title)}</div>
                                <div style="font-size:0.78rem;color:var(--text-secondary)">
                                    ${p.sizes.map(s => `${s.size}: ${s.price}₴`).join(', ')}
                                </div>
                            </div>
                            <span class="admin-product-status ${p.is_active ? 'active' : 'archived'}">
                                ${p.is_active ? 'Активний' : 'Архів'}
                            </span>
                        </div>
                    `).join('')}
                </div>
            ` : `<div class="empty-state"><div class="empty-text">Товарів ще немає</div></div>`}
        `;
    },

    openCreate() {
        this.currentProduct = null;
        document.getElementById('adminEditTitle').textContent = 'Новий товар';
        app.navigate('admin-edit');
        this.renderEditForm(null);
    },

    async openEdit(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        this.currentProduct = product;
        document.getElementById('adminEditTitle').textContent = product.title;
        app.navigate('admin-edit');
        this.renderEditForm(product);
    },

    renderEditForm(product) {
        const container = document.getElementById('adminEditContent');
        const sizesStr = product ? product.sizes.map(s => `${s.size}:${s.price}`).join(', ') : '';

        container.innerHTML = `
            <div class="form-group">
                <label class="form-label">Назва товару</label>
                <input class="form-input" id="adminTitle" value="${product ? this._esc(product.title) : ''}" placeholder="Футболка FICE">
            </div>
            <div class="form-group">
                <label class="form-label">Опис</label>
                <textarea class="form-input" id="adminDesc" placeholder="Опис товару...">${product ? this._esc(product.description) : ''}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Розміри та ціни (формат: S:500, M:550, L:600)</label>
                <input class="form-input" id="adminSizes" value="${sizesStr}" placeholder="S:500, M:550, L:600">
            </div>
            <label class="checkbox-row" style="margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="adminRequiresColor" onchange="admin.toggleColorOptions(this.checked)" ${product && product.requires_color ? 'checked' : ''}>
                <span class="checkbox-label" style="font-size:0.9rem">Товар має опцію кольору (Білий/Чорний)</span>
            </label>

            <div class="section-title" id="photoWhiteTitle">Фото товару (Білий / За замовчуванням)</div>
            <div class="file-upload-area" id="adminPhotoArea">
                <input type="file" accept="image/*" onchange="admin.onPhotoSelected(event)">
                <div id="adminPhotoPreview">
                    ${product && product.photo_url 
                        ? `<img class="file-upload-preview" src="${product.photo_url}" alt="">
                           <div class="file-upload-text" style="margin-top:8px">Натисніть, щоб змінити</div>`
                        : `<div class="file-upload-icon">↑</div>
                           <div class="file-upload-text">Додати фото</div>`
                    }
                </div>
            </div>

            <div id="adminBlackPhotoSection" style="display: ${product && product.requires_color ? 'block' : 'none'}; margin-top: 20px;">
                <div class="section-title">Фото товару (Чорний)</div>
                <div class="file-upload-area" id="adminPhotoBlackArea">
                    <input type="file" accept="image/*" onchange="admin.onPhotoBlackSelected(event)">
                    <div id="adminPhotoBlackPreview">
                        ${product && product.photo_black_url 
                            ? `<img class="file-upload-preview" src="${product.photo_black_url}" alt="">
                               <div class="file-upload-text" style="margin-top:8px">Натисніть, щоб змінити</div>`
                            : `<div class="file-upload-icon">↑</div>
                               <div class="file-upload-text">Додати фото (Чорний)</div>`
                        }
                    </div>
                </div>
            </div>

            <button class="btn-primary" id="adminSaveBtn" onclick="admin.save()" style="margin-top:20px">
                ${product ? 'Зберегти зміни' : 'Створити товар'}
            </button>

            ${product ? `
                <button class="btn-secondary ${product.is_active ? 'btn-danger' : ''}" onclick="admin.toggleActive(${product.id})" style="margin-top:8px">
                    ${product.is_active ? 'Архівувати' : 'Активувати'}
                </button>
            ` : ''}
        `;
        this._newPhotoFile = null;
        this._newPhotoBlackFile = null;
    },

    toggleColorOptions(isChecked) {
        const section = document.getElementById('adminBlackPhotoSection');
        if (section) section.style.display = isChecked ? 'block' : 'none';
        
        const title = document.getElementById('photoWhiteTitle');
        if (title) title.textContent = isChecked ? 'Фото товару (Білий)' : 'Фото товару';
    },

    _newPhotoFile: null,
    _newPhotoBlackFile: null,

    onPhotoSelected(e) {
        const file = e.target.files[0];
        if (!file) return;
        this._newPhotoFile = file;
        document.getElementById('adminPhotoArea').classList.add('has-file');
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('adminPhotoPreview').innerHTML = `
                <img class="file-upload-preview" src="${ev.target.result}" alt="">
                <div class="file-upload-text" style="margin-top:8px">Фото обрано</div>`;
        };
        reader.readAsDataURL(file);
    },

    onPhotoBlackSelected(e) {
        const file = e.target.files[0];
        if (!file) return;
        this._newPhotoBlackFile = file;
        document.getElementById('adminPhotoBlackArea').classList.add('has-file');
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('adminPhotoBlackPreview').innerHTML = `
                <img class="file-upload-preview" src="${ev.target.result}" alt="">
                <div class="file-upload-text" style="margin-top:8px">Фото (Чорний) обрано</div>`;
        };
        reader.readAsDataURL(file);
    },

    async save() {
        const title = document.getElementById('adminTitle').value.trim();
        const description = document.getElementById('adminDesc').value.trim();
        const sizesRaw = document.getElementById('adminSizes').value.trim();
        const requires_color = document.getElementById('adminRequiresColor').checked;

        if (!title || !description || !sizesRaw) { app.showToast('Заповніть всі поля'); return; }

        let sizes;
        try {
            sizes = {};
            sizesRaw.split(',').forEach(chunk => {
                const [size, price] = chunk.trim().split(':');
                if (!size || !price) throw new Error();
                sizes[size.trim().toUpperCase()] = parseFloat(price.trim());
            });
        } catch { app.showToast('Невірний формат розмірів'); return; }

        const btn = document.getElementById('adminSaveBtn');
        btn.disabled = true;
        btn.textContent = 'Зберігаємо...';

        try {
            let productId;
            if (this.currentProduct) {
                await api.updateProduct(this.currentProduct.id, { title, description, requires_color, sizes });
                productId = this.currentProduct.id;
            } else {
                const result = await api.createProduct({ title, description, requires_color, sizes });
                productId = result.id;
            }
            if (this._newPhotoFile) {
                const fd = new FormData();
                fd.append('photo', this._newPhotoFile);
                await api.uploadProductPhoto(productId, fd);
            }
            if (this._newPhotoBlackFile && requires_color) {
                const fd = new FormData();
                fd.append('photo', this._newPhotoBlackFile);
                await api.uploadProductBlackPhoto(productId, fd);
            }
            app.showToast('Збережено');
            app.navigate('admin');
            await this.load();
        } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Зберегти';
            app.showToast('Помилка: ' + e.message);
        }
    },

    async toggleActive(productId) {
        try {
            const result = await api.toggleProduct(productId);
            app.showToast(result.is_active ? 'Товар активовано' : 'Товар архівовано');
            app.navigate('admin');
            await this.load();
        } catch (e) { app.showToast('Помилка'); }
    },

    _esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
};
