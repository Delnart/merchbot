'use client';

import { useEffect, useRef, useState } from 'react';
import type { CatalogProduct, UserGroup } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/api';

interface AdminEditPageProps {
  product: CatalogProduct | null;
  groups: UserGroup[];
  onSave: (data: {
    title: string;
    description: string;
    variants: {size: string, color: string, price: string, quantity: string}[];
    requiresColor: boolean;
    groupIds: number[];
    photoFile: File | null;
    photoBlackFile: File | null;
  }) => Promise<void>;
}

export default function AdminEditPage({ product, groups, onSave }: AdminEditPageProps) {
  const [title, setTitle] = useState(product?.title ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [variants, setVariants] = useState<{size: string, color: string, price: string, quantity: string}[]>(
    product ? product.variants.map(v => ({
      size: v.size,
      color: v.color ?? '',
      price: v.price.toString(),
      quantity: v.quantity !== null ? v.quantity.toString() : ''
    })) : [{ size: 'S', color: 'Білий', price: '500', quantity: '' }]
  );
  const [requiresColor, setRequiresColor] = useState(product?.requires_color ?? false);
  const [groupIds, setGroupIds] = useState<number[]>(product?.group_ids ?? []);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoBlackFile, setPhotoBlackFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    resolveMediaUrl(product?.photo_url),
  );
  const [photoBlackPreview, setPhotoBlackPreview] = useState<string | null>(
    resolveMediaUrl(product?.photo_black_url),
  );
  const [saving, setSaving] = useState(false);

  const photoRef = useRef<HTMLInputElement>(null);
  const photoBlackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(product?.title ?? '');
    setDescription(product?.description ?? '');
    setVariants(
      product ? product.variants.map(v => ({
        size: v.size,
        color: v.color ?? '',
        price: v.price.toString(),
        quantity: v.quantity !== null ? v.quantity.toString() : ''
      })) : [{ size: 'S', color: 'Білий', price: '500', quantity: '' }]
    );
    setRequiresColor(product?.requires_color ?? false);
    setGroupIds(product?.group_ids ?? []);
    setPhotoFile(null);
    setPhotoBlackFile(null);
    setPhotoPreview(resolveMediaUrl(product?.photo_url));
    setPhotoBlackPreview(resolveMediaUrl(product?.photo_black_url));
  }, [product?.id]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, isBlack: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (isBlack) {
        setPhotoBlackPreview(ev.target?.result as string);
        setPhotoBlackFile(file);
      } else {
        setPhotoPreview(ev.target?.result as string);
        setPhotoFile(file);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({ title, description, variants, requiresColor, groupIds, photoFile, photoBlackFile });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="form-group">
        <label className="form-label">Назва товару</label>
        <input
          className="form-input"
          placeholder="Футболка FICE"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Опис</label>
        <textarea
          className="form-input"
          placeholder="Опис товару..."
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label" style={{ marginBottom: 12 }}>Варіанти товару</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {variants.map((v, idx) => (
            <div key={idx} className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 4 }}>Розмір</label>
                  <input
                    className="form-input"
                    value={v.size}
                    onChange={e => {
                      const newV = [...variants];
                      newV[idx].size = e.target.value;
                      setVariants(newV);
                    }}
                    placeholder="S"
                  />
                </div>
                {requiresColor && (
                  <div style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 4 }}>Колір</label>
                    <input
                      className="form-input"
                      value={v.color}
                      onChange={e => {
                        const newV = [...variants];
                        newV[idx].color = e.target.value;
                        setVariants(newV);
                      }}
                      placeholder="Білий"
                    />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 4 }}>Ціна (грн)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={v.price}
                    onChange={e => {
                      const newV = [...variants];
                      newV[idx].price = e.target.value;
                      setVariants(newV);
                    }}
                    placeholder="500"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 4 }}>Залишок (шт)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={v.quantity}
                    onChange={e => {
                      const newV = [...variants];
                      newV[idx].quantity = e.target.value;
                      setVariants(newV);
                    }}
                    placeholder="Безлім"
                  />
                </div>
              </div>
              {variants.length > 1 && (
                <button
                  className="btn-secondary btn-danger btn-small"
                  onClick={() => setVariants(variants.filter((_, i) => i !== idx))}
                  type="button"
                  style={{ alignSelf: 'flex-end', marginTop: 4 }}
                >
                  Видалити варіант
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          className="btn-secondary"
          onClick={() => setVariants([...variants, { size: '', color: requiresColor ? 'Білий' : '', price: '500', quantity: '' }])}
          type="button"
          style={{ marginTop: 12 }}
        >
          + Додати варіант
        </button>
      </div>

      <label className="checkbox-row" style={{ marginBottom: 16 }}>
        <input
          type="checkbox"
          checked={requiresColor}
          onChange={e => setRequiresColor(e.target.checked)}
        />
        <span className="checkbox-label">Товар має опцію кольору (Білий/Чорний)</span>
      </label>

      {groups.length > 0 && (
        <div className="form-group">
          <label className="form-label">
            Хто бачить товар {groupIds.length === 0 && '(зараз: всі користувачі)'}
          </label>
          {groups.map(g => (
            <label key={g.id} className="checkbox-row" style={{ marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={groupIds.includes(g.id)}
                onChange={e =>
                  setGroupIds(prev =>
                    e.target.checked ? [...prev, g.id] : prev.filter(id => id !== g.id),
                  )
                }
              />
              <span className="checkbox-label">
                👥 {g.name} ({g.members.length})
              </span>
            </label>
          ))}
          <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: 4 }}>
            Якщо нічого не обрано — товар бачать усі. Якщо обрано групи — лише їхні учасники.
          </div>
        </div>
      )}

      <p className="section-title" style={{ marginTop: 0 }}>
        {requiresColor ? 'Фото товару (Білий)' : 'Фото товару'}
      </p>
      <div
        className={`file-upload-area ${photoFile || product?.photo_url ? 'has-file' : ''}`}
        style={{ marginBottom: 16 }}
      >
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          className="file-upload-input"
          onChange={e => handlePhotoChange(e, false)}
        />
        {photoPreview ? (
          <>
            <img src={photoPreview} className="file-upload-preview" alt="Фото" />
            <div className="file-upload-text" style={{ marginTop: 8 }}>
              Натисніть, щоб змінити
            </div>
          </>
        ) : (
          <>
            <div className="file-upload-icon">↑</div>
            <div className="file-upload-text">Додати фото</div>
          </>
        )}
      </div>

      {requiresColor && (
        <>
          <p className="section-title">Фото товару (Чорний)</p>
          <div
            className={`file-upload-area ${photoBlackFile || product?.photo_black_url ? 'has-file' : ''}`}
            style={{ marginBottom: 16 }}
          >
            <input
              ref={photoBlackRef}
              type="file"
              accept="image/*"
              className="file-upload-input"
              onChange={e => handlePhotoChange(e, true)}
            />
            {photoBlackPreview ? (
              <>
                <img src={photoBlackPreview} className="file-upload-preview" alt="Фото чорний" />
                <div className="file-upload-text" style={{ marginTop: 8 }}>
                  Натисніть, щоб змінити
                </div>
              </>
            ) : (
              <>
                <div className="file-upload-icon">↑</div>
                <div className="file-upload-text">Додати фото (Чорний)</div>
              </>
            )}
          </div>
        </>
      )}

      <button
        className="btn-primary"
        onClick={handleSave}
        disabled={saving || !title.trim() || !description.trim() || variants.length === 0}
        type="button"
        style={{ marginTop: 4 }}
      >
        {saving ? 'Зберігаємо...' : product ? 'Зберегти зміни' : 'Створити товар'}
      </button>
    </>
  );
}