'use client';

import { useState } from 'react';
import type { UserGroup } from '@/lib/api';
import Spinner from '@/components/ui/spinner';

interface AdminGroupsPageProps {
  groups: UserGroup[];
  loading: boolean;
  onCreateGroup: (name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  onAddMembers: (groupId: number, values: string) => Promise<number>;
  onRemoveMember: (groupId: number, memberId: number) => Promise<void>;
}

export default function AdminGroupsPage({
  groups,
  loading,
  onCreateGroup,
  onDeleteGroup,
  onAddMembers,
  onRemoveMember,
}: AdminGroupsPageProps) {
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [memberInput, setMemberInput] = useState('');
  const [addingMembers, setAddingMembers] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);

  if (loading) return <Spinner />;

  const handleCreate = async () => {
    const name = newGroupName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await onCreateGroup(name);
      setNewGroupName('');
    } catch {
      // request failed — keep the input so the admin can retry
    } finally {
      setCreating(false);
    }
  };

  const handleAddMembers = async (groupId: number) => {
    const values = memberInput.trim();
    if (!values || addingMembers) return;
    setAddingMembers(true);
    try {
      const added = await onAddMembers(groupId, values);
      if (added > 0) setMemberInput('');
    } catch {
      // request failed — keep the input so the admin can retry
    } finally {
      setAddingMembers(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedId(prev => (prev === id ? null : id));
    setMemberInput('');
    setConfirmingDeleteId(null);
  };

  return (
    <>
      <div className="form-group">
        <label className="form-label">Нова група (напр. Куратори)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            placeholder="Назва групи"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
          />
          <button
            className="btn-primary"
            style={{ width: 'auto', whiteSpace: 'nowrap' }}
            onClick={handleCreate}
            disabled={!newGroupName.trim() || creating}
            type="button"
          >
            {creating ? '...' : '+ Додати'}
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <div className="empty-text">
            Груп ще немає. Створіть групу, додайте учасників — і зможете робити товари,
            видимі лише для цієї групи.
          </div>
        </div>
      ) : (
        <div className="card">
          {groups.map((g, idx) => (
            <div key={g.id}>
              {idx > 0 && <div className="divider" />}
              <div
                className="admin-product-item"
                onClick={() => toggleExpand(g.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && toggleExpand(g.id)}
              >
                <div className="admin-product-info">
                  <div className="admin-product-title">👥 {g.name}</div>
                  <div className="admin-product-sizes">
                    Учасників: {g.members.length}
                  </div>
                </div>
                <span style={{ opacity: 0.5 }}>{expandedId === g.id ? '▲' : '▼'}</span>
              </div>

              {expandedId === g.id && (
                <div style={{ padding: '0 4px 12px' }}>
                  {g.members.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      {g.members.map(m => (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 0',
                          }}
                        >
                          <span>
                            {m.username ? `@${m.username}` : `ID: ${m.telegram_id}`}
                          </span>
                          <button
                            className="btn-secondary btn-small btn-danger"
                            onClick={() => void onRemoveMember(g.id, m.id)}
                            type="button"
                          >
                            Прибрати
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">
                      Додати учасників: Telegram ID або @username (через кому чи з нового рядка)
                    </label>
                    <textarea
                      className="form-input"
                      placeholder={'@username1, 123456789\n@username2'}
                      value={memberInput}
                      onChange={e => setMemberInput(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => void handleAddMembers(g.id)}
                    disabled={!memberInput.trim() || addingMembers}
                    type="button"
                    style={{ marginBottom: 8 }}
                  >
                    {addingMembers ? 'Додаємо...' : 'Додати учасників'}
                  </button>
                  <button
                    className="btn-secondary btn-danger"
                    onClick={() => {
                      if (confirmingDeleteId === g.id) {
                        setConfirmingDeleteId(null);
                        void onDeleteGroup(g.id);
                      } else {
                        setConfirmingDeleteId(g.id);
                      }
                    }}
                    type="button"
                  >
                    {confirmingDeleteId === g.id
                      ? 'Натисніть ще раз для підтвердження'
                      : 'Видалити групу'}
                  </button>
                  <div style={{ fontSize: '0.75rem', opacity: 0.55, marginTop: 6 }}>
                    Товари, видимі лише цій групі, буде заархівовано.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
