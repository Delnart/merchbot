'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CartItem, CartResponse, CatalogProduct, Order, Recipient, ShopConfig, UserGroup } from '@/lib/api';
import { buildApiClient } from '@/lib/api';
import { getTelegramInitData, getTelegramWebApp, isOpenedInTelegram } from '@/lib/telegram';
import { humanizeApiError, parseVariantsInput } from '@/lib/validation';

import AdminEditPage from '@/components/pages/admin-edit-page';
import AdminGroupsPage from '@/components/pages/admin-groups-page';
import AdminPage from '@/components/pages/admin-page';
import CartPage from '@/components/pages/cart-page';
import CatalogPage from '@/components/pages/catalog-page';
import CheckoutPage from '@/components/pages/checkout-page';
import ProductPage from '@/components/pages/product-page';
import SettingsPage from '@/components/pages/settings-page';
import SuccessPage from '@/components/pages/success-page';
import PickupPage from '@/components/pages/pickup-page';
import AdminPickupPage from '@/components/pages/admin-pickup-page';
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
  | 'admin-groups'
  | 'admin-pickup'
  | 'pickup'
  | 'success';

const PAGE_TITLES: Record<Page, string> = {
  catalog: 'Каталог',
  product: '',
  cart: 'Кошик',
  checkout: 'Оформлення',
  settings: 'Мій профіль',
  admin: 'Управління товарами',
  'admin-edit': '',
  'admin-groups': 'Групи користувачів',
  'admin-pickup': 'Слоти видачі',
  pickup: 'Обрати час видачі',
  success: 'Готово',
};

export default function MiniAppShell() {
  const [page, setPage] = useState<Page>('catalog');
  const [toast, setToast] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const [notInTelegram, setNotInTelegram] = useState(false);
  const [pickupOrderId, setPickupOrderId] = useState<number | null>(null);

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
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Admin
  const [adminProducts, setAdminProducts] = useState<CatalogProduct[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [adminGroups, setAdminGroups] = useState<UserGroup[]>([]);

  // Success
  const [successOrderId, setSuccessOrderId] = useState<number | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror of `cart` read synchronously by optimistic handlers (state is async),
  // plus per-item debounce timers + pending target quantities so a burst of
  // +/- taps sends one request and can be flushed before checkout.
  const cartRef = useRef<CartResponse>({ items: [], total: 0 });
  const cartSyncTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const cartPending = useRef<Record<number, number>>({});

  const initData = useMemo(() => getTelegramInitData(), []);
  const api = useMemo(() => buildApiClient(initData), [initData]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2500);
  }, []);

  // Update ref and state together so the next tap sees the latest cart instantly
  const applyCart = useCallback((next: CartResponse) => {
    cartRef.current = next;
    setCart(next);
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

    const bootstrap = () => {
      // Admin check runs in parallel and never blocks the first render
      const adminPromise = api
        .checkAdmin()
        .then(d => setIsAdmin(Boolean(d.is_admin)))
        .catch(() => {
          // not an admin — that's fine
        });

      const urlPage = new URLSearchParams(window.location.search).get('page');
      const urlOrderId = new URLSearchParams(window.location.search).get('order_id');
      if (urlPage === 'admin') {
        setPage('admin');
        void loadAdmin();
      } else if (urlPage === 'pickup' && urlOrderId) {
        setPickupOrderId(parseInt(urlOrderId, 10));
        setPage('pickup');
      }
      
      setBootstrapDone(true); // show UI instantly

      Promise.all([api.getCatalog(), api.getCart()])
        .then(([catalogData, cartData]) => {
          setProducts(catalogData.products);
          applyCart(cartData);
        })
        .catch(e => showToast(humanizeApiError(e)))
        .finally(() => setCatalogLoading(false));
    };

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, showToast]);

  // ── Cart badge update ─────────────────────────────────────────────────────
  const reloadCart = useCallback(async () => {
    try {
      const server = await api.getCart();
      const pending = cartPending.current;
      if (Object.keys(pending).length === 0) {
        applyCart(server);
        return;
      }
      // Keep still-pending optimistic quantities on top of server truth, so a
      // refetch never clobbers edits the user made but we haven't synced yet.
      const items: CartItem[] = [];
      for (const i of server.items) {
        const pq = pending[i.id];
        if (pq === undefined) items.push(i);
        else if (pq >= 1) items.push({ ...i, quantity: pq, line_total: i.price * pq });
        // pq < 1 → pending removal, omit
      }
      applyCart({ items, total: items.reduce((s, x) => s + x.line_total, 0) });
    } catch {
      // silent
    }
  }, [api, applyCart]);

  const syncCartItem = useCallback(async (itemId: number, qty: number) => {
    try {
      if (qty < 1) await api.removeCartItem(itemId);
      else await api.updateCartItem(itemId, qty);
    } catch (e) {
      showToast(humanizeApiError(e));
      void reloadCart();
    }
  }, [api, showToast, reloadCart]);

  // Debounced server sync for quantity changes: rapid taps collapse into one
  // request carrying the final quantity, avoiding out-of-order overwrites.
  const scheduleCartSync = useCallback((itemId: number, qty: number) => {
    cartPending.current[itemId] = qty;
    const timers = cartSyncTimers.current;
    if (timers[itemId]) clearTimeout(timers[itemId]);
    timers[itemId] = setTimeout(() => {
      delete timers[itemId];
      const target = cartPending.current[itemId];
      delete cartPending.current[itemId];
      if (target !== undefined) void syncCartItem(itemId, target);
    }, 400);
  }, [syncCartItem]);

  // Send any pending quantity changes immediately and wait for them — the
  // server must reflect the real quantities before checkout reads the cart.
  const flushCartSyncs = useCallback(async () => {
    const entries = Object.entries(cartPending.current);
    Object.values(cartSyncTimers.current).forEach(clearTimeout);
    cartSyncTimers.current = {};
    cartPending.current = {};
    if (entries.length === 0) return;
    await Promise.all(entries.map(([id, qty]) => syncCartItem(Number(id), qty)));
  }, [syncCartItem]);

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
    setPage('product');
    window.scrollTo(0, 0);
    // The catalog list already carries everything the product page needs, so
    // open instantly from it and just refresh in the background.
    const cached = products.find(p => p.id === id) ?? null;
    setSelectedProduct(cached);
    setProductLoading(!cached);
    try {
      const p = await api.getProduct(id);
      setSelectedProduct(p);
    } catch (e) {
      if (!cached) {
        showToast(humanizeApiError(e));
        setPage('catalog');
      }
    } finally {
      setProductLoading(false);
    }
  };

  const addToCart = async (size: string, color: string | null, quantity: number) => {
    if (!selectedProduct) return;
    try {
      await api.addToCart(selectedProduct.id, size, color, quantity);
      showToast(quantity > 1 ? `Додано в кошик · ${quantity} шт ✓` : 'Додано в кошик ✓');
      void reloadCart(); // sync in background — don't make the button wait
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  // ── Cart (optimistic) ───────────────────────────────────────────────────────
  const changeCartQty = useCallback((itemId: number, delta: number) => {
    const prev = cartRef.current;
    const item = prev.items.find(i => i.id === itemId);
    if (!item) return;
    const newQty = Math.max(0, Math.min(99, item.quantity + delta));
    if (newQty === item.quantity) return; // already at a bound
    const nextItems = newQty < 1
      ? prev.items.filter(i => i.id !== itemId)
      : prev.items.map(i =>
          i.id === itemId ? { ...i, quantity: newQty, line_total: i.price * newQty } : i,
        );
    const total = nextItems.reduce((s, i) => s + i.line_total, 0);
    applyCart({ items: nextItems, total }); // instant
    scheduleCartSync(itemId, newQty);
  }, [applyCart, scheduleCartSync]);

  const removeCartLine = useCallback((itemId: number) => {
    const timers = cartSyncTimers.current;
    if (timers[itemId]) {
      clearTimeout(timers[itemId]);
      delete timers[itemId];
    }
    delete cartPending.current[itemId];
    const prev = cartRef.current;
    const nextItems = prev.items.filter(i => i.id !== itemId);
    applyCart({ items: nextItems, total: nextItems.reduce((s, i) => s + i.line_total, 0) });
    api.removeCartItem(itemId).catch(e => {
      showToast(humanizeApiError(e));
      void reloadCart();
    });
  }, [api, applyCart, showToast, reloadCart]);

  const clearCart = useCallback(() => {
    Object.values(cartSyncTimers.current).forEach(clearTimeout);
    cartSyncTimers.current = {};
    cartPending.current = {};
    applyCart({ items: [], total: 0 });
    api.clearCart()
      .then(() => showToast('Кошик очищено'))
      .catch(e => {
        showToast(humanizeApiError(e));
        void reloadCart(); // restore actual server state (pending was cleared)
      });
  }, [api, applyCart, showToast, reloadCart]);

  // ── Checkout ──────────────────────────────────────────────────────────────
  const openCheckout = async () => {
    setCheckoutLoading(true);
    setPage('checkout');
    try {
      // Push any pending quantity edits first, so the server cart the order is
      // built from matches exactly what the user sees.
      await flushCartSyncs();
      const [recData, cfgData, cartData] = await Promise.all([
        api.getRecipients(),
        api.getConfig(),
        api.getCart(),
      ]);
      setCheckoutRecipients(recData.recipients);
      setConfig(cfgData);
      applyCart(cartData);
    } catch (e) {
      showToast(humanizeApiError(e));
      setPage('cart');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const submitCheckout = async (formData: FormData) => {
    try {
      const photo = formData.get('receipt_photo') as File | null;
      if (photo && photo.size > 9.9 * 1024 * 1024) {
        throw new Error('file_too_large');
      }

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
    // Spinner only on the first visit; later opens show cached data and
    // refresh silently in the background (stale-while-revalidate).
    if (!settingsLoaded) setSettingsLoading(true);
    try {
      const [recData, ordData] = await Promise.all([api.getRecipients(), api.getOrders()]);
      setRecipients(recData.recipients);
      setOrders(ordData.orders);
      setSettingsLoaded(true);
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
    if (!adminLoaded) setAdminLoading(true);
    try {
      const [productsData, groupsData] = await Promise.all([
        api.getAdminProducts(),
        api.getAdminGroups(),
      ]);
      setAdminProducts(productsData.products);
      setAdminGroups(groupsData.groups);
      setAdminLoaded(true);
    } catch (e) {
      showToast(humanizeApiError(e));
    } finally {
      setAdminLoading(false);
    }
  };

  const reloadGroups = async () => {
    try {
      const data = await api.getAdminGroups();
      setAdminGroups(data.groups);
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const createGroup = async (name: string) => {
    try {
      await api.createGroup(name);
      await reloadGroups();
      showToast('Групу створено ✓');
    } catch (e) {
      showToast(humanizeApiError(e));
      throw e; // let the form keep its input
    }
  };

  const deleteGroup = async (id: number) => {
    try {
      const result = await api.deleteGroup(id);
      await Promise.all([reloadGroups(), loadAdmin()]);
      showToast(
        result.archived_products > 0
          ? `Групу видалено. Товарів заархівовано: ${result.archived_products}`
          : 'Групу видалено',
      );
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const addGroupMembers = async (groupId: number, values: string): Promise<number> => {
    try {
      const result = await api.addGroupMembers(groupId, values);
      await reloadGroups();
      showToast(result.added > 0 ? `Додано учасників: ${result.added} ✓` : 'Нікого не додано — перевірте формат');
      return result.added;
    } catch (e) {
      showToast(humanizeApiError(e));
      throw e; // let the form keep its input
    }
  };

  const removeGroupMember = async (groupId: number, memberId: number) => {
    try {
      await api.removeGroupMember(groupId, memberId);
      await reloadGroups();
    } catch (e) {
      showToast(humanizeApiError(e));
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
    variants: {size: string, color: string, price: string, quantity: string}[];
    requiresColor: boolean;
    groupIds: number[];
    photoFile: File | null;
    photoBlackFile: File | null;
  }) => {
    if (!data.title.trim() || !data.description.trim()) {
      showToast('Заповніть назву та опис');
      return;
    }

    let parsedVariants;
    try {
      parsedVariants = parseVariantsInput(JSON.stringify(data.variants), data.requiresColor);
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
          variants: parsedVariants,
          group_ids: data.groupIds,
        });
        productId = editingProduct.id;
      } else {
        const created = await api.createProduct({
          title: data.title.trim(),
          description: data.description.trim(),
          requires_color: data.requiresColor,
          variants: parsedVariants,
          group_ids: data.groupIds,
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
    page === 'admin-edit' ||
    page === 'admin-groups';

  const backPage: Page =
    page === 'product' ? 'catalog' :
    page === 'checkout' ? 'cart' :
    page === 'admin-edit' ? 'admin' :
    page === 'admin-groups' ? 'admin' : 'catalog';

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
            onChangeQty={changeCartQty}
            onRemove={removeCartLine}
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
            onPickup={orderId => {
              setPickupOrderId(orderId);
              setPage('pickup');
              window.scrollTo(0, 0);
            }}
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
            onOpenGroups={() => {
              setPage('admin-groups');
              window.scrollTo(0, 0);
            }}
            onOpenPickupSlots={() => {
              setPage('admin-pickup');
              window.scrollTo(0, 0);
            }}
          />
        )}

        {page === 'admin-edit' && (
          <AdminEditPage
            product={editingProduct}
            groups={adminGroups}
            onSave={data => saveProduct(data)}
          />
        )}

        {page === 'admin-groups' && (
          <AdminGroupsPage
            groups={adminGroups}
            loading={adminLoading}
            onCreateGroup={createGroup}
            onDeleteGroup={deleteGroup}
            onAddMembers={addGroupMembers}
            onRemoveMember={removeGroupMember}
          />
        )}

        {page === 'admin-pickup' && (
          <AdminPickupPage
            api={api}
            showToast={showToast}
            onBack={() => {
              setPage('admin');
              window.scrollTo(0, 0);
            }}
          />
        )}

        {page === 'pickup' && pickupOrderId && (
          <PickupPage
            orderId={pickupOrderId}
            api={api}
            showToast={showToast}
            onSuccess={() => {
              void loadSettings();
              setPage('settings');
              window.scrollTo(0, 0);
            }}
          />
        )}

        {page === 'success' && (
          <SuccessPage orderId={successOrderId} onBack={() => navigate('catalog')} />
        )}
      </main>

      {/* Bottom nav — hidden on sub-pages */}
      {!showBack && page !== 'success' && page !== 'pickup' && (
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