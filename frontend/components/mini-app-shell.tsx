'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CartResponse, CatalogProduct, Order, Recipient, ShopConfig } from '@/lib/api';
import { buildApiClient } from '@/lib/api';
import { getTelegramInitData, getTelegramWebApp, isOpenedInTelegram } from '@/lib/telegram';
import { humanizeApiError, parseSizesInput } from '@/lib/validation';

import AdminEditPage from '@/components/pages/admin-edit-page';
import AdminPage from '@/components/pages/admin-page';
import CartPage from '@/components/pages/cart-page';
import CatalogPage from '@/components/pages/catalog-page';
import CheckoutPage from '@/components/pages/checkout-page';
import ProductPage from '@/components/pages/product-page';
import SettingsPage from '@/components/pages/settings-page';
import SuccessPage from '@/components/pages/success-page';
import BottomNav from '@/components/ui/bottom-nav';
import Toast from '@/components/ui/toast';

export type Page =
  | 'catalog'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'settings'
  | 'admin'
  | 'admin-edit'
  | 'success';

const PAGE_TITLES: Record<Page, string> = {
  catalog: 'Каталог',
  product: '',
  cart: 'Кошик',
  checkout: 'Оформлення',
  settings: 'Мій профіль',
  admin: 'Управління товарами',
  'admin-edit': '',
  success: 'Готово',
};

export default function MiniAppShell() {
  const [page, setPage] = useState<Page>('catalog');
  const [toast, setToast] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const [notInTelegram, setNotInTelegram] = useState(false);

  // Catalog
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  // Product detail
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [productLoading, setProductLoading] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartResponse>({ items: [], total: 0 });

  // Checkout
  const [checkoutRecipients, setCheckoutRecipients] = useState<Recipient[]>([]);
  const [config, setConfig] = useState<ShopConfig | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Settings
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Admin
  const [adminProducts, setAdminProducts] = useState<CatalogProduct[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);

  // Success
  const [successOrderId, setSuccessOrderId] = useState<number | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initData = useMemo(() => getTelegramInitData(), []);
  const api = useMemo(() => buildApiClient(initData), [initData]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2500);
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();

    if (!isOpenedInTelegram()) {
      setNotInTelegram(true);
      setBootstrapDone(true);
      setCatalogLoading(false);
      return;
    }

    const bootstrap = async () => {
      try {
        const [catalogData, cartData] = await Promise.all([api.getCatalog(), api.getCart()]);
        setProducts(catalogData.products);
        setCart(cartData);

        try {
          const adminData = await api.checkAdmin();
          setIsAdmin(Boolean(adminData.is_admin));
        } catch {
          // not an admin — that's fine
        }

        const urlPage = new URLSearchParams(window.location.search).get('page');
        if (urlPage === 'admin') setPage('admin');
      } catch (e) {
        showToast(humanizeApiError(e));
      } finally {
        setCatalogLoading(false);
        setBootstrapDone(true);
      }
    };

    void bootstrap();
  }, [api, showToast]);

  // ── Cart badge update ─────────────────────────────────────────────────────
  const reloadCart = useCallback(async () => {
    try {
      const data = await api.getCart();
      setCart(data);
    } catch {
      // silent
    }
  }, [api]);

  const cartCount = useMemo(
    () => cart.items.reduce((s, i) => s + i.quantity, 0),
    [cart.items],
  );

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = useCallback(
    (target: Page) => {
      setPage(target);
      window.scrollTo(0, 0);

      switch (target) {
        case 'catalog':
          if (products.length === 0) {
            setCatalogLoading(true);
            api.getCatalog()
              .then(d => setProducts(d.products))
              .catch(e => showToast(humanizeApiError(e)))
              .finally(() => setCatalogLoading(false));
          }
          break;
        case 'cart':
          void reloadCart();
          break;
        case 'settings':
          void loadSettings();
          break;
        case 'admin':
          void loadAdmin();
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, products.length, reloadCart, showToast],
  );

  // Catalog nav event from cart empty-state button
  useEffect(() => {
    const handler = () => navigate('catalog');
    window.addEventListener('nav:catalog', handler);
    return () => window.removeEventListener('nav:catalog', handler);
  }, [navigate]);

  // ── Product ───────────────────────────────────────────────────────────────
  const openProduct = async (id: number) => {
    setProductLoading(true);
    setPage('product');
    try {
      const p = await api.getProduct(id);
      setSelectedProduct(p);
    } catch (e) {
      showToast(humanizeApiError(e));
      setPage('catalog');
    } finally {
      setProductLoading(false);
    }
  };

  const addToCart = async (size: string, color: string | null) => {
    if (!selectedProduct) return;
    try {
      await api.addToCart(selectedProduct.id, size, color);
      await reloadCart();
      showToast('Додано в кошик ✓');
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  // ── Cart ──────────────────────────────────────────────────────────────────
  const updateCartQty = async (itemId: number, qty: number) => {
    try {
      if (qty < 1) {
        await api.removeCartItem(itemId);
      } else {
        await api.updateCartItem(itemId, qty);
      }
      await reloadCart();
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const clearCart = async () => {
    try {
      await api.clearCart();
      await reloadCart();
      showToast('Кошик очищено');
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  // ── Checkout ──────────────────────────────────────────────────────────────
  const openCheckout = async () => {
    setCheckoutLoading(true);
    setPage('checkout');
    try {
      const [recData, cfgData, cartData] = await Promise.all([
        api.getRecipients(),
        api.getConfig(),
        api.getCart(),
      ]);
      setCheckoutRecipients(recData.recipients);
      setConfig(cfgData);
      setCart(cartData);
    } catch (e) {
      showToast(humanizeApiError(e));
      setPage('cart');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const submitCheckout = async (formData: FormData) => {
    try {
      const result = await api.checkout(formData);
      await reloadCart();
      setSuccessOrderId(result.order_id);
      setPage('success');
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  // ── Settings ──────────────────────────────────────────────────────────────
  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const [recData, ordData] = await Promise.all([api.getRecipients(), api.getOrders()]);
      setRecipients(recData.recipients);
      setOrders(ordData.orders);
    } catch (e) {
      showToast(humanizeApiError(e));
    } finally {
      setSettingsLoading(false);
    }
  };

  const createRecipient = async (name: string, phone: string) => {
    await api.createRecipient({ full_name: name, phone });
    await loadSettings();
    showToast('Отримувача додано');
  };

  const setDefaultRecipient = async (id: number) => {
    await api.setDefaultRecipient(id);
    await loadSettings();
  };

  const deleteRecipient = async (id: number) => {
    await api.deleteRecipient(id);
    await loadSettings();
    showToast('Видалено');
  };

  // ── Admin ─────────────────────────────────────────────────────────────────
  const loadAdmin = async () => {
    setAdminLoading(true);
    try {
      const data = await api.getAdminProducts();
      setAdminProducts(data.products);
    } catch (e) {
      showToast(humanizeApiError(e));
    } finally {
      setAdminLoading(false);
    }
  };

  const toggleProduct = async (id: number) => {
    try {
      await api.toggleProduct(id);
      await loadAdmin();
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const saveProduct = async (data: {
    title: string;
    description: string;
    sizesRaw: string;
    requiresColor: boolean;
    photoFile: File | null;
    photoBlackFile: File | null;
  }) => {
    if (!data.title.trim() || !data.description.trim()) {
      showToast('Заповніть назву та опис');
      return;
    }

    let sizes: Record<string, number>;
    try {
      sizes = parseSizesInput(data.sizesRaw);
    } catch (e) {
      showToast(humanizeApiError(e));
      return;
    }

    try {
      let productId: number;
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, {
          title: data.title.trim(),
          description: data.description.trim(),
          requires_color: data.requiresColor,
          sizes,
        });
        productId = editingProduct.id;
      } else {
        const created = await api.createProduct({
          title: data.title.trim(),
          description: data.description.trim(),
          requires_color: data.requiresColor,
          sizes,
        });
        productId = created.id;
      }

      if (data.photoFile) {
        const fd = new FormData();
        fd.append('photo', data.photoFile);
        await api.uploadProductPhoto(productId, fd);
      }

      if (data.photoBlackFile && data.requiresColor) {
        const fd = new FormData();
        fd.append('photo', data.photoBlackFile);
        await api.uploadProductBlackPhoto(productId, fd);
      }

      showToast('Збережено ✓');
      navigate('admin');

      // also refresh catalog
      api.getCatalog().then(d => setProducts(d.products)).catch(() => null);
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (notInTelegram) {
    return (
      <div className="gate-screen">
        <div className="gate-icon">✈️</div>
        <div className="gate-title">Відкрийте через Telegram</div>
        <div className="gate-text">
          Mini App працює лише при запуску з кнопки в Telegram-боті.
        </div>
      </div>
    );
  }

  if (!bootstrapDone) {
    return (
      <div className="gate-screen">
        <div className="spinner" />
      </div>
    );
  }

  const pageTitle =
    page === 'product'
      ? selectedProduct?.title ?? 'Товар'
      : page === 'admin-edit'
        ? editingProduct
          ? editingProduct.title
          : 'Новий товар'
        : PAGE_TITLES[page];

  const showBack =
    page === 'product' ||
    page === 'checkout' ||
    page === 'admin-edit';

  const backPage: Page =
    page === 'product' ? 'catalog' :
    page === 'checkout' ? 'cart' :
    page === 'admin-edit' ? 'admin' : 'catalog';

  return (
    <div className="mini-wrap">
      {/* Header */}
      <header className="app-header">
        {showBack && (
          <button
            className="back-btn"
            onClick={() => navigate(backPage)}
            type="button"
            aria-label="Назад"
          >
            ←
          </button>
        )}
        <h1>{pageTitle}</h1>
      </header>

      {/* Page content */}
      <main className="page-content">
        {page === 'catalog' && (
          <CatalogPage
            products={products}
            loading={catalogLoading}
            onOpenProduct={id => void openProduct(id)}
          />
        )}

        {page === 'product' && (
          <ProductPage
            product={selectedProduct}
            loading={productLoading}
            onAddToCart={addToCart}
          />
        )}

        {page === 'cart' && (
          <CartPage
            cart={cart}
            loading={false}
            onUpdateQty={updateCartQty}
            onClear={clearCart}
            onCheckout={() => void openCheckout()}
          />
        )}

        {page === 'checkout' && config && (
          <CheckoutPage
            cart={cart}
            config={config}
            recipients={checkoutRecipients}
            loading={checkoutLoading}
            onSubmit={fd => submitCheckout(fd)}
          />
        )}

        {page === 'settings' && (
          <SettingsPage
            recipients={recipients}
            orders={orders}
            loading={settingsLoading}
            onSetDefault={setDefaultRecipient}
            onDelete={deleteRecipient}
            onCreateRecipient={createRecipient}
          />
        )}

        {page === 'admin' && (
          <AdminPage
            products={adminProducts}
            loading={adminLoading}
            onCreate={() => {
              setEditingProduct(null);
              setPage('admin-edit');
            }}
            onEdit={p => {
              setEditingProduct(p);
              setPage('admin-edit');
            }}
            onToggle={toggleProduct}
          />
        )}

        {page === 'admin-edit' && (
          <AdminEditPage
            product={editingProduct}
            onSave={data => saveProduct(data)}
          />
        )}

        {page === 'success' && (
          <SuccessPage orderId={successOrderId} onBack={() => navigate('catalog')} />
        )}
      </main>

      {/* Bottom nav — hidden on sub-pages */}
      {!showBack && page !== 'success' && (
        <BottomNav
          page={page}
          cartCount={cartCount}
          isAdmin={isAdmin}
          onNavigate={p => {
              if (p === 'settings') void loadSettings();
              if (p === 'admin') void loadAdmin();
              if (p === 'cart') void reloadCart();     // ← додати
              if (p === 'catalog' && products.length === 0) {
                setCatalogLoading(true);
                api.getCatalog().then(d => setProducts(d.products)).finally(() => setCatalogLoading(false));
              }
              setPage(p);
              window.scrollTo(0, 0);
            }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}