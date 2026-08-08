'use client';

import { useEffect, useState } from 'react';
import type { PickupSlot } from '@/lib/api';
import Spinner from '@/components/ui/spinner';
import { humanizeApiError } from '@/lib/validation';

interface PickupPageProps {
  orderId: number;
  api: any;
  onSuccess: () => void;
  showToast: (msg: string) => void;
}

export default function PickupPage({ orderId, api, onSuccess, showToast }: PickupPageProps) {
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [needsIndividual, setNeedsIndividual] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    api.getPickupSlots()
      .then((data: { slots: PickupSlot[] }) => {
        if (active) setSlots(data.slots);
      })
      .catch((e: Error) => showToast(humanizeApiError(e)))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [api, showToast]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.selectPickupSlot(orderId, {
        pickup_slot_id: selectedSlotId,
        needs_individual_pickup: needsIndividual
      });
      showToast('Час видачі збережено!');
      onSuccess();
    } catch (e) {
      showToast(humanizeApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="page-enter">
      <h1 className="section-title" style={{ marginTop: 0 }}>Оберіть час видачі</h1>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
        Замовлення #{orderId}
      </p>

      {slots.length === 0 ? (
        <div className="empty-state">
          <div className="empty-text">Немає доступних слотів для видачі.</div>
          <div style={{ fontSize: '0.8rem', marginTop: 8 }}>Ви можете домовитись про індивідуальну видачу або обрати час пізніше.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {slots.map(s => {
            const dateStr = new Date(s.date).toLocaleDateString('uk-UA', { month: 'short', day: 'numeric' });
            return (
              <div
                key={s.id}
                className={`selection-card ${selectedSlotId === s.id ? 'selected' : ''}`}
                onClick={() => setSelectedSlotId(selectedSlotId === s.id ? null : s.id)}
              >
                <div className="radio-dot">
                  <div className="radio-dot-inner" />
                </div>
                <span className="selection-card-text">
                  {dateStr}, {s.start_time} - {s.end_time}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={needsIndividual}
            onChange={e => setNeedsIndividual(e.target.checked)}
          />
          <span className="checkbox-label" style={{ fontWeight: 500 }}>
            Потрібна індивідуальна видача
          </span>
        </label>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4, paddingLeft: 30 }}>
          Оберіть, якщо ви не можете забрати замовлення в запропонований час. Ми зв'яжемось з вами.
        </p>
      </div>

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={submitting || (!selectedSlotId && !needsIndividual)}
        type="button"
      >
        {submitting ? 'Зберігаємо...' : 'Підтвердити'}
      </button>
    </div>
  );
}
