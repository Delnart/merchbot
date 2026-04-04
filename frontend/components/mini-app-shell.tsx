"use client";

import { useEffect, useMemo, useState } from "react";

import type { CartResponse, CatalogProduct, Order, Recipient, ShopConfig } from "@/lib/api";
import { buildApiClient } from "@/lib/api";
import { getTelegramWebApp, isOpenedInTelegram } from "@/lib/telegram";
import { humanizeApiError, isValidUaPhone, parseSizesInput } from "@/lib/validation";

import AdminEditPage from "@/components/pages/admin-edit-page";
import AdminPage from "@/components/pages/admin-page";
import CartPage from "@/components/pages/cart-page";
import CatalogPage from "@/components/pages/catalog-page";
import CheckoutPage from "@/components/pages/checkout-page";
import ProductPage from "@/components/pages/product-page";
import SettingsPage from "@/components/pages/settings-page";
import SuccessPage from "@/components/pages/success-page";
import Toast from "@/components/ui/toast";

type Page = "catalog" | "product" | "cart" | "checkout" | "settings" | "admin" | "admin-edit" | "success";

function statusLabel(status: string): string {
  if (status === "pending") return "Очікує";
  if (status === "in_process") return "В роботі";
  if (status === "completed") return "Виконано";
  if (status === "cancelled") return "Скасовано";
  return status;
}

export default function MiniAppShell() {
  const [page, setPage] = useState<Page>("catalog");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("Білий");

  const [cart, setCart] = useState<CartResponse>({ items: [], total: 0 });

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [config, setConfig] = useState<ShopConfig | null>(null);

  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [recipientId, setRecipientId] = useState<number | null>(null);
  const [newRecipientName, setNewRecipientName] = useState("");
  const [newRecipientPhone, setNewRecipientPhone] = useState("");
  const [saveRecipient, setSaveRecipient] = useState(true);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [adminProducts, setAdminProducts] = useState<CatalogProduct[]>([]);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [adminTitle, setAdminTitle] = useState("");
  const [adminDescription, setAdminDescription] = useState("");
  const [adminSizes, setAdminSizes] = useState("");
  const [adminRequiresColor, setAdminRequiresColor] = useState(false);
  const [adminPhoto, setAdminPhoto] = useState<File | null>(null);
  const [adminPhotoBlack, setAdminPhotoBlack] = useState<File | null>(null);

  const [successOrderId, setSuccessOrderId] = useState<number | null>(null);

  const initData = getTelegramWebApp()?.initData ?? "";
  const api = useMemo(() => buildApiClient(initData), [initData]);
  const inTelegram = useMemo(() => isOpenedInTelegram(), []);

  const cartCount = useMemo(() => cart.items.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout((showToast as unknown as { timer?: number }).timer);
    (showToast as unknown as { timer?: number }).timer = window.setTimeout(() => setToast(""), 2500);
  };

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        if (!inTelegram) {
          setError("open_via_telegram_required");
          return;
        }

        const [catalogResponse, cartResponse] = await Promise.all([api.getCatalog(), api.getCart()]);
        setProducts(catalogResponse.products);
        setCart(cartResponse);

        try {
          const adminResponse = await api.checkAdmin();
          setIsAdmin(Boolean(adminResponse.is_admin));
        } catch {
          setIsAdmin(false);
        }

        const pageParam = new URLSearchParams(window.location.search).get("page");
        if (pageParam === "admin") setPage("admin");
      } catch (e) {
        setError(e instanceof Error ? e.message : "unknown_error");
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [api, inTelegram]);

  const openProduct = async (productId: number) => {
    try {
      const product = await api.getProduct(productId);
      setSelectedProduct(product);
      setSelectedSize(product.sizes[0]?.size ?? "");
      setSelectedColor("Білий");
      setPage("product");
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const reloadCatalog = async () => {
    const catalogResponse = await api.getCatalog();
    setProducts(catalogResponse.products);
  };

  const reloadCart = async () => {
    const cartResponse = await api.getCart();
    setCart(cartResponse);
  };

  const addToCart = async () => {
    if (!selectedProduct || !selectedSize) {
      showToast("Оберіть розмір товару.");
      return;
    }

    try {
      await api.addToCart(selectedProduct.id, selectedSize, selectedProduct.requires_color ? selectedColor : undefined);
      await reloadCart();
      showToast("Товар додано у кошик.");
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const updateCartQty = async (itemId: number, quantity: number) => {
    try {
      if (quantity < 1) {
        await api.removeCartItem(itemId);
      } else {
        await api.updateCartItem(itemId, quantity);
      }
      await reloadCart();
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const openCheckout = async () => {
    try {
      const [recipientsResponse, configResponse, cartResponse] = await Promise.all([
        api.getRecipients(),
        api.getConfig(),
        api.getCart(),
      ]);
      setRecipients(recipientsResponse.recipients);
      setConfig(configResponse);
      setCart(cartResponse);

      const defaultRecipient = recipientsResponse.recipients.find((item) => item.is_default);
      setRecipientId(defaultRecipient?.id ?? null);
      setDeliveryMethod("");
      setDeliveryAddress("");
      setNewRecipientName("");
      setNewRecipientPhone("");
      setReceiptFile(null);
      setPage("checkout");
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const submitCheckout = async () => {
    if (!receiptFile) {
      showToast("Додайте скрін оплати.");
      return;
    }
    if (!deliveryMethod) {
      showToast("Оберіть спосіб доставки.");
      return;
    }
    if (deliveryMethod === "nova_poshta" && !deliveryAddress.trim()) {
      showToast("Вкажіть адресу для Нової Пошти.");
      return;
    }

    if (recipientId === null) {
      if (!newRecipientName.trim()) {
        showToast("Вкажіть ПІБ отримувача.");
        return;
      }
      if (!isValidUaPhone(newRecipientPhone)) {
        showToast("Некоректний номер телефону.");
        return;
      }
    }

    try {
      const formData = new FormData();
      formData.append("delivery_method", deliveryMethod);
      formData.append("delivery_address", deliveryAddress.trim());

      if (recipientId) {
        formData.append("recipient_id", String(recipientId));
      } else {
        formData.append("recipient_name", newRecipientName.trim());
        formData.append("recipient_phone", newRecipientPhone.trim());
        formData.append("save_recipient", String(saveRecipient));
      }

      formData.append("receipt_photo", receiptFile);

      const response = await api.checkout(formData);
      await reloadCart();
      setSuccessOrderId(response.order_id);
      setPage("success");
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const openSettings = async () => {
    try {
      const [recipientsResponse, ordersResponse] = await Promise.all([api.getRecipients(), api.getOrders()]);
      setRecipients(recipientsResponse.recipients);
      setOrders(ordersResponse.orders);
      setPage("settings");
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const createRecipient = async () => {
    if (!newRecipientName.trim()) {
      showToast("Вкажіть ПІБ.");
      return;
    }
    if (!isValidUaPhone(newRecipientPhone)) {
      showToast("Некоректний номер телефону.");
      return;
    }

    try {
      await api.createRecipient({ full_name: newRecipientName.trim(), phone: newRecipientPhone.trim() });
      setNewRecipientName("");
      setNewRecipientPhone("");
      await openSettings();
      showToast("Отримувача додано.");
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const setDefaultRecipient = async (id: number) => {
    try {
      await api.setDefaultRecipient(id);
      await openSettings();
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const deleteRecipient = async (id: number) => {
    try {
      await api.deleteRecipient(id);
      await openSettings();
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const openAdmin = async () => {
    try {
      const response = await api.getAdminProducts();
      setAdminProducts(response.products);
      setPage("admin");
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const startCreateProduct = () => {
    setEditingProduct(null);
    setAdminTitle("");
    setAdminDescription("");
    setAdminSizes("");
    setAdminRequiresColor(false);
    setAdminPhoto(null);
    setAdminPhotoBlack(null);
    setPage("admin-edit");
  };

  const startEditProduct = (product: CatalogProduct) => {
    setEditingProduct(product);
    setAdminTitle(product.title);
    setAdminDescription(product.description);
    setAdminSizes(product.sizes.map((size) => `${size.size}:${size.price}`).join(", "));
    setAdminRequiresColor(product.requires_color);
    setAdminPhoto(null);
    setAdminPhotoBlack(null);
    setPage("admin-edit");
  };

  const toggleProduct = async (productId: number) => {
    try {
      await api.toggleProduct(productId);
      await openAdmin();
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  const saveProduct = async () => {
    if (!adminTitle.trim() || !adminDescription.trim()) {
      showToast("Заповніть назву та опис товару.");
      return;
    }

    let sizes: Record<string, number>;
    try {
      sizes = parseSizesInput(adminSizes);
    } catch (e) {
      showToast(humanizeApiError(e));
      return;
    }

    try {
      let productId = editingProduct?.id;

      if (editingProduct) {
        await api.updateProduct(editingProduct.id, {
          title: adminTitle.trim(),
          description: adminDescription.trim(),
          requires_color: adminRequiresColor,
          sizes,
        });
      } else {
        const created = await api.createProduct({
          title: adminTitle.trim(),
          description: adminDescription.trim(),
          requires_color: adminRequiresColor,
          sizes,
        });
        productId = created.id;
      }

      if (productId && adminPhoto) {
        const fd = new FormData();
        fd.append("photo", adminPhoto);
        await api.uploadProductPhoto(productId, fd);
      }

      if (productId && adminPhotoBlack && adminRequiresColor) {
        const fd = new FormData();
        fd.append("photo", adminPhotoBlack);
        await api.uploadProductBlackPhoto(productId, fd);
      }

      await openAdmin();
      await reloadCatalog();
      showToast("Товар збережено.");
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  if (loading) {
    return (
      <main className="page">
        <section className="panel">
          <p>Завантаження...</p>
        </section>
      </main>
    );
  }

  if (error === "open_via_telegram_required") {
    return (
      <main className="page">
        <section className="panel">
          <h1>Відкрийте застосунок через Telegram</h1>
          <p>Mini App працює тільки при запуску з кнопки у Telegram-боті.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="miniWrap">
      <header className="topBar">
        <h1>
          {page === "catalog" && "Каталог"}
          {page === "product" && selectedProduct?.title}
          {page === "cart" && "Кошик"}
          {page === "checkout" && "Оформлення"}
          {page === "settings" && "Мій профіль"}
          {page === "admin" && "Управління товарами"}
          {page === "admin-edit" && (editingProduct ? "Редагування товару" : "Новий товар")}
          {page === "success" && "Замовлення оформлено"}
        </h1>
      </header>

      <section className="contentCard">
        {page === "catalog" && <CatalogPage products={products} onOpenProduct={(id) => void openProduct(id)} />}

        {page === "product" && selectedProduct && (
          <ProductPage
            product={selectedProduct}
            selectedSize={selectedSize}
            selectedColor={selectedColor}
            setSelectedSize={setSelectedSize}
            setSelectedColor={setSelectedColor}
            onAddToCart={() => void addToCart()}
          />
        )}

        {page === "cart" && <CartPage cart={cart} onUpdateQty={(id, qty) => void updateCartQty(id, qty)} onOpenCheckout={() => void openCheckout()} />}

        {page === "checkout" && config && (
          <CheckoutPage
            cart={cart}
            config={config}
            recipients={recipients}
            recipientId={recipientId}
            setRecipientId={setRecipientId}
            newRecipientName={newRecipientName}
            setNewRecipientName={setNewRecipientName}
            newRecipientPhone={newRecipientPhone}
            setNewRecipientPhone={setNewRecipientPhone}
            saveRecipient={saveRecipient}
            setSaveRecipient={setSaveRecipient}
            deliveryMethod={deliveryMethod}
            setDeliveryMethod={setDeliveryMethod}
            deliveryAddress={deliveryAddress}
            setDeliveryAddress={setDeliveryAddress}
            setReceiptFile={setReceiptFile}
            onSubmit={() => void submitCheckout()}
          />
        )}

        {page === "settings" && (
          <SettingsPage
            recipients={recipients}
            orders={orders}
            newRecipientName={newRecipientName}
            setNewRecipientName={setNewRecipientName}
            newRecipientPhone={newRecipientPhone}
            setNewRecipientPhone={setNewRecipientPhone}
            onSetDefaultRecipient={(id) => void setDefaultRecipient(id)}
            onDeleteRecipient={(id) => void deleteRecipient(id)}
            onCreateRecipient={() => void createRecipient()}
            statusLabel={statusLabel}
          />
        )}

        {page === "admin" && (
          <AdminPage
            products={adminProducts}
            onCreate={startCreateProduct}
            onEdit={startEditProduct}
            onToggle={(id) => void toggleProduct(id)}
          />
        )}

        {page === "admin-edit" && (
          <AdminEditPage
            title={adminTitle}
            description={adminDescription}
            sizes={adminSizes}
            requiresColor={adminRequiresColor}
            setTitle={setAdminTitle}
            setDescription={setAdminDescription}
            setSizes={setAdminSizes}
            setRequiresColor={setAdminRequiresColor}
            setPhoto={setAdminPhoto}
            setPhotoBlack={setAdminPhotoBlack}
            onSave={() => void saveProduct()}
          />
        )}

        {page === "success" && <SuccessPage orderId={successOrderId} onBackCatalog={() => setPage("catalog")} />}
      </section>

      <nav className="bottomNav">
        <button className={page === "catalog" ? "navBtn active" : "navBtn"} onClick={() => setPage("catalog")}>Каталог</button>
        <button className={page === "cart" ? "navBtn active" : "navBtn"} onClick={() => setPage("cart")}>Кошик {cartCount > 0 ? `(${cartCount})` : ""}</button>
        <button className={page === "settings" ? "navBtn active" : "navBtn"} onClick={() => void openSettings()}>Профіль</button>
        {isAdmin && <button className={page === "admin" ? "navBtn active" : "navBtn"} onClick={() => void openAdmin()}>Адмін</button>}
      </nav>

      <Toast message={toast} />
    </main>
  );
}
