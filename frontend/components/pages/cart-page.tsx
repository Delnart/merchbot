'use client';

import Image from 'next/image';
import type { CartResponse } from '@/lib/api';
import Spinner from '@/components/ui/spinner';

interface CartPageProps {
  cart: CartResponse;
  loading: boolean;
  onUpdateQty: (itemId: number, qty: number) => Promise<void>;
  onClear: () => Promise<void>;
  onCheckout: () => void;
}

export default function CartPage({ cart, loading, onUpdateQty, onClear, onCheckout }: CartPageProps) {
  if (loading) return <Spinner />;

  if (!cart.items.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🛒</div>
        <div className="empty-text">Ваш кошик порожній</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            className="btn-primary"
            style={{ maxWidth: 240 }}
            onClick={() => window.dispatchEvent(new CustomEvent('nav:catalog'))}
            type="button"
          >
            До каталогу
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        {cart.items.map((item, idx) => (
          <div key={item.id}>
            {idx > 0 && <div className="divider" />}
            <div className="cart-item">
              <div className="cart-item-image-wrap">
                {item.photo_url ? (
                  <Image
                    src={item.photo_url}
                    alt={item.title}
                    fill
                    unoptimized
                    sizes="64px"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <div className="product-image-placeholder" style={{ fontSize: '0.6rem' }}>
                    Фото
                  </div>
                )}
              </div>

              <div className="cart-item-info">
                <div className="cart-item-title">{item.title}</div>
                <div className="cart-item-meta">
                  Розмір: {item.size}
                  {item.color && ` / Колір: ${item.color}`}
                </div>
                <div className="cart-item-price">{item.line_total} грн</div>
              </div>

              <div className="cart-item-actions">
                <div className="qty-control">
                  <button
                    className="qty-btn"
                    onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                    type="button"
                    aria-label="Зменшити"
                  >
                    −
                  </button>
                  <span className="qty-value">{item.quantity}</span>
                  <button
                    className="qty-btn"
                    onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                    type="button"
                    aria-label="Збільшити"
                  >
                    +
                  </button>
                </div>
                <button
                  className="remove-btn"
                  onClick={() => onUpdateQty(item.id, 0)}
                  type="button"
                  aria-label="Видалити"
                >
                  Видалити
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="cart-total">
          <span>Разом</span>
          <span className="total-price">{cart.total} грн</span>
        </div>
      </div>

      <button className="btn-primary" onClick={onCheckout} type="button" style={{ marginBottom: 8 }}>
        Оформити замовлення
      </button>
      <button className="btn-secondary btn-danger" onClick={onClear} type="button">
        Очистити кошик
      </button>
    </>
  );
}