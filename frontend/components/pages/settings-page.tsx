'use client';

import { useState } from 'react';
import type { Order, Recipient } from '@/lib/api';
import { deliveryLabel, isValidUaPhone, orderStatusLabel } from '@/lib/validation';
import Spinner from '@/components/ui/spinner';

interface SettingsPageProps {
  recipients: Recipient[];
  orders: Order[];
  loading: boolean;
  onSetDefault: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onCreateRecipient: (name: string, phone: string) => Promise<void>;
}

export default function SettingsPage({
  recipients,
  orders,
  loading,
  onSetDefault,
  onDelete,
  onCreateRecipient,
}: SettingsPageProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading) return <Spinner />;

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (!isValidUaPhone(phone)) return;
    setSaving(true);
    try {
      await onCreateRecipient(name.trim(), phone.trim());
      setName('');
      setPhone('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Recipients */}
      <p className="section-title" style={{ marginTop: 0 }}>
        Збережені отримувачі
      </p>
      {recipients.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          {recipients.map((r, idx) => (
            <div key={r.id}>
              {idx > 0 && <div className="divider" />}
              <div className="recipient-card">
                <div className="recipient-info">
                  <div className="recipient-name">{r.full_name}</div>
                  <div className="recipient-phone">{r.phone}</div>
                </div>
                {r.is_default ? (
                  <span className="default-badge">За замовч.</span>
                ) : (
                  <button
                    className="btn-secondary btn-small"
                    onClick={() => onSetDefault(r.id)}
                    type="button"
                  >
                    Обрати
                  </button>
                )}
                <button
                  className="remove-btn"
                  onClick={() => onDelete(r.id)}
                  type="button"
                  aria-label="Видалити"
                  style={{ marginLeft: 4 }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 16 }}>
          Немає збережених отримувачів
        </p>
      )}

      {/* Orders */}
      <p className="section-title">Історія замовлень</p>
      {orders.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          {orders.map((o, idx) => (
            <div key={o.id}>
              {idx > 0 && <div className="divider" />}
              <div className="order-row">
                <div className="order-header">
                  <span className="order-id">Замовлення #{o.id}</span>
                  <span className="order-date">{o.created_at.split('T')[0]}</span>
                </div>
                <div className="order-delivery">
                  {o.delivery_method === 'nova_poshta'
                    ? `Нова Пошта — ${o.address}`
                    : deliveryLabel(o.delivery_method ?? '')}
                </div>
                <div className="order-footer">
                  <span className="order-total">{o.total_amount} грн</span>
                  <span className={`order-status-badge ${o.status}`}>
                    {orderStatusLabel(o.status)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '20px 0', marginBottom: 16 }}>
          <div className="empty-text">Ви ще не робили замовлень</div>
        </div>
      )}

      {/* Add recipient */}
      <p className="section-title">Додати отримувача</p>
      <div className="card" style={{ padding: 14 }}>
        <div className="form-group">
          <label className="form-label">ПІБ (По-батькові не обов&#x2019;язково)</label>
          <input
            className="form-input"
            placeholder="Прізвище Ім'я"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Номер телефону</label>
          <input
            className="form-input"
            type="tel"
            placeholder="+380... або 0..."
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>
        <button
          className="btn-primary"
          onClick={handleCreate}
          disabled={saving || !name.trim() || !isValidUaPhone(phone)}
          type="button"
        >
          {saving ? 'Зберігаємо...' : 'Додати'}
        </button>
      </div>
    </>
  );
}