'use client';

import { useRef, useState } from 'react';
import type { CartResponse, Recipient, ShopConfig } from '@/lib/api';
import { compressImage, isValidUaPhone } from '@/lib/validation';
import Spinner from '@/components/ui/spinner';

type DeliveryMethod = 'nova_poshta' | 'campus' | 'dayf' | 'later_campus';

const DELIVERY_OPTIONS: { id: DeliveryMethod; label: string }[] = [
  { id: 'nova_poshta', label: 'Нова Пошта' },
  { id: 'campus', label: 'На DayF' },
  { id: 'later_campus', label: 'Пізніше в корпусі' },
];

interface CheckoutPageProps {
  cart: CartResponse;
  config: ShopConfig;
  recipients: Recipient[];
  loading: boolean;
  onSubmit: (formData: FormData) => Promise<void>;
}

export default function CheckoutPage({
  cart,
  config,
  recipients,
  loading,
  onSubmit,
}: CheckoutPageProps) {
  const [recipientId, setRecipientId] = useState<number | null>(
    recipients.find(r => r.is_default)?.id ?? null,
  );
  const [showNewForm, setShowNewForm] = useState(recipients.length === 0);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saveRecipient, setSaveRecipient] = useState(true);

  const [delivery, setDelivery] = useState<DeliveryMethod | null>(null);
  const [address, setAddress] = useState('');

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const deliveryOptions = config.is_dayf_delivery_enabled
    ? [...DELIVERY_OPTIONS.slice(0, 2), { id: 'dayf' as DeliveryMethod, label: 'DayF' }, DELIVERY_OPTIONS[2]]
    : DELIVERY_OPTIONS;

  const hasRecipient = recipientId !== null || (!!newName.trim() && isValidUaPhone(newPhone));
  const isValid =
    hasRecipient &&
    delivery !== null &&
    (delivery !== 'nova_poshta' || address.trim().length > 0) &&
    receiptFile !== null;

  if (loading) return <Spinner />;

  const handleReceiptChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setReceiptFile(compressed);
    const url = URL.createObjectURL(compressed);
    setReceiptPreview(url);
  };

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append('delivery_method', delivery!);

      if (delivery === 'nova_poshta') {
        fd.append('delivery_address', address.trim());
      } else {
        fd.append('delivery_address', '');
      }

      if (recipientId !== null) {
        fd.append('recipient_id', String(recipientId));
      } else {
        fd.append('recipient_name', newName.trim());
        fd.append('recipient_phone', newPhone.trim());
        fd.append('save_recipient', String(saveRecipient));
      }

      fd.append('receipt_photo', receiptFile!);
      await onSubmit(fd);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Order summary */}
      <p className="section-title" style={{ marginTop: 0 }}>
        Ваше замовлення
      </p>
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        {cart.items.map(item => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 6,
              fontSize: '0.85rem',
            }}
          >
            <span>
              {item.title} ({item.size}
              {item.color ? ` — ${item.color}` : ''}) ×{item.quantity}
            </span>
            <span style={{ fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
              {item.line_total} грн
            </span>
          </div>
        ))}
        <div className="divider" style={{ margin: '10px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Разом</span>
          <span>{cart.total} грн</span>
        </div>
      </div>

      {/* Recipient */}
      <p className="section-title">Отримувач</p>
      {recipients.map(r => (
        <div
          key={r.id}
          className={`selection-card ${!showNewForm && recipientId === r.id ? 'selected' : ''}`}
          onClick={() => {
            setRecipientId(r.id);
            setShowNewForm(false);
          }}
        >
          <div className="radio-dot">
            <div className="radio-dot-inner" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.full_name}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{r.phone}</div>
          </div>
          {r.is_default && <span className="default-badge">За замовч.</span>}
        </div>
      ))}

      {recipients.length > 0 && (
        <div
          className={`selection-card ${showNewForm ? 'selected' : ''}`}
          onClick={() => {
            setShowNewForm(true);
            setRecipientId(null);
          }}
        >
          <div className="radio-dot">
            <div className="radio-dot-inner" />
          </div>
          <span className="selection-card-text">Інший отримувач</span>
        </div>
      )}

      {showNewForm && (
        <div style={{ marginTop: 12 }}>
          <div className="form-group">
            <label className="form-label">ПІБ (По-батькові не обов&#x2019;язково)</label>
            <input
              className="form-input"
              placeholder="Прізвище Ім'я"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Номер телефону</label>
            <input
              className="form-input"
              type="tel"
              placeholder="+380... або 0..."
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={saveRecipient}
              onChange={e => setSaveRecipient(e.target.checked)}
            />
            <span className="checkbox-label">Зберегти отримувача</span>
          </label>
        </div>
      )}

      {/* Delivery */}
      <p className="section-title">Спосіб доставки</p>
      {deliveryOptions.map(opt => (
        <div
          key={opt.id}
          className={`selection-card ${delivery === opt.id ? 'selected' : ''}`}
          onClick={() => setDelivery(opt.id)}
        >
          <div className="radio-dot">
            <div className="radio-dot-inner" />
          </div>
          <span className="selection-card-text">{opt.label}</span>
        </div>
      ))}

      {delivery === 'nova_poshta' && (
        <div className="form-group" style={{ marginTop: 8 }}>
          <label className="form-label">Місто та номер відділення НП</label>
          <input
            className="form-input"
            placeholder="Київ, відділення №5"
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
        </div>
      )}

      {/* Payment */}
      <p className="section-title">Оплата</p>
      <div className="card payment-card" style={{ marginBottom: 16 }}>
        <div className="payment-amount">
          Оплатіть <strong>{cart.total} грн</strong> за посиланням:
        </div>
        <a
          href={config.mono_jar_url}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
          style={{ textAlign: 'center', display: 'block' }}
        >
          Відкрити Банку Monobank
        </a>
        {config.card_number && (
          <div className="payment-card-number">
            Або перекажіть на картку:
            <strong>{config.card_number}</strong>
          </div>
        )}
        <div className="payment-hint">Після оплати завантажте скріншот квитанції</div>
      </div>

      {/* Receipt upload */}
      <p className="section-title">Скріншот квитанції</p>
      <div className={`file-upload-area ${receiptFile ? 'has-file' : ''}`} style={{ marginBottom: 20 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="file-upload-input"
          onChange={handleReceiptChange}
        />
        {receiptPreview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receiptPreview} className="file-upload-preview" alt="Квитанція" />
            <div className="file-upload-text" style={{ marginTop: 8 }}>
              Натисніть, щоб змінити
            </div>
          </>
        ) : (
          <>
            <div className="file-upload-icon">↑</div>
            <div className="file-upload-text">Натисніть, щоб завантажити</div>
          </>
        )}
      </div>

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={!isValid || submitting}
        type="button"
      >
        {submitting ? 'Оформлюємо...' : 'Оформити замовлення'}
      </button>
    </>
  );
}