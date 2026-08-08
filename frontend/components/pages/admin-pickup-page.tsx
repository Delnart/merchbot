'use client';

import { useEffect, useState } from 'react';
import type { PickupSlot } from '@/lib/api';
import Spinner from '@/components/ui/spinner';
import { humanizeApiError } from '@/lib/validation';

interface AdminPickupPageProps {
  api: any;
  showToast: (msg: string) => void;
  onBack: () => void;
}

export default function AdminPickupPage({ api, showToast, onBack }: AdminPickupPageProps) {
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [creating, setCreating] = useState(false);

  const loadSlots = async () => {
    try {
      setLoading(true);
      const res = await api.getAdminPickupSlots();
      setSlots(res.slots);
    } catch (e) {
      showToast(humanizeApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!newDate || !newStartTime || !newEndTime) return;
    setCreating(true);
    try {
      await api.createPickupSlot({ date: newDate, start_time: newStartTime, end_time: newEndTime });
      setNewDate('');
      setNewStartTime('');
      setNewEndTime('');
      await loadSlots();
    } catch (e) {
      showToast(humanizeApiError(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Видалити слот?')) return;
    try {
      await api.deletePickupSlot(id);
      await loadSlots();
    } catch (e) {
      showToast(humanizeApiError(e));
    }
  };

  return (
    <div className="page-enter">
      <button className="btn-secondary" onClick={onBack} type="button" style={{ marginBottom: 16 }}>
        ← Назад
      </button>

      <h1 className="section-title" style={{ marginTop: 0 }}>Слоти видачі</h1>
      
      <div className="card" style={{ padding: 14, marginBottom: 20 }}>
        <h2 style={{ fontSize: '1rem', marginTop: 0, marginBottom: 12 }}>Додати слот</h2>
        <div className="form-group">
          <label className="form-label">Дата (YYYY-MM-DD)</label>
          <input
            className="form-input"
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Початок (HH:MM)</label>
            <input
              className="form-input"
              type="time"
              value={newStartTime}
              onChange={e => setNewStartTime(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Кінець (HH:MM)</label>
            <input
              className="form-input"
              type="time"
              value={newEndTime}
              onChange={e => setNewEndTime(e.target.value)}
            />
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={handleCreate}
          disabled={creating || !newDate || !newStartTime || !newEndTime}
          type="button"
        >
          {creating ? 'Додаємо...' : 'Додати слот'}
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : slots.length === 0 ? (
        <div className="empty-state">
          <div className="empty-text">Немає жодного слота</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {slots.map(s => (
            <div key={s.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{s.date}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{s.start_time} - {s.end_time}</div>
              </div>
              <button className="btn-secondary btn-danger btn-small" onClick={() => handleDelete(s.id)} type="button">
                Видалити
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
