'use client';

import { useRef, useState } from 'react';
import type { CatalogProduct } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/api';

interface AdminEditPageProps {
  product: CatalogProduct | null;
  onSave: (data: {
    title: string;
    description: string;
    sizesRaw: string;
    requiresColor: boolean;
    photoFile: File | null;
    photoBlackFile: File | null;
  }) => Promise<void>;
}

export default function AdminEditPage({ product, onSave }: AdminEditPageProps) {
  const [title, setTitle] = useState(product?.title ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [sizesRaw, setSizesRaw] = useState(
    product ? product.sizes.map(s => `${s.size}:${s.price}`).join(', ') : '',
  );
  const [requiresColor, setRequiresColor] = useState(product?.requires_color ?? false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoBlackFile, setPhotoBlackFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(resolveMediaUrl(product?.photo_url));
  const [photoBlackPreview, setPhotoBlackPreview] = useState<string | null>(
    resolveMediaUrl(product?.photo_black_url),
  );
  const [saving, setSaving] = useState(false);

  const photoRef = useRef<HTMLInputElement>(null);
  const photoBlackRef = useRef<HTMLInputElement>(null);

  // Track product change
  const [prevId, setPrevId] = useState(product?.id ?? null);
  if (product?.id !== prevId) {
    setPrevId(product?.id ?? null);
    setTitle(product?.title ?? '');
    setDescription(product?.description ?? '');
    setSizesRaw(product ? product.sizes.map(s => `${s.size}:${s.price}`).join(', ') : '');
    setRequiresColor(product?.requires_color ?? false);
    setPhotoFile(null);
    setPhotoBlackFile(null);
    setPhotoPreview(resolveMediaUrl(product?.photo_url));
    setPhotoBlackPreview(resolveMediaUrl(product?.photo_black_url));
  }

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
      await onSave({ title, description, sizesRaw, requiresColor, photoFile, photoBlackFile });
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
        <label className="form-label">Розміри та ціни (S:500, M:550, L:600)</label>
        <input
          className="form-input"
          placeholder="S:500, M:550, L:600"
          value={sizesRaw}
          onChange={e => setSizesRaw(e.target.value)}
        />
      </div>

      <label className="checkbox-row" style={{ marginBottom: 16 }}>
        <input
          type="checkbox"
          checked={requiresColor}
          onChange={e => setRequiresColor(e.target.checked)}
        />
        <span className="checkbox-label">Товар має опцію кольору (Білий/Чорний)</span>
      </label>

      {/* Photo white */}
      <p className="section-title" style={{ marginTop: 0 }}>
        {requiresColor ? 'Фото товару (Білий)' : 'Фото товару'}
      </p>
      <div className={`file-upload-area ${photoFile || product?.photo_url ? 'has-file' : ''}`} style={{ marginBottom: 16 }}>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          className="file-upload-input"
          onChange={e => handlePhotoChange(e, false)}
        />
        {photoPreview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {/* Photo black */}
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
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
        disabled={saving || !title.trim() || !description.trim() || !sizesRaw.trim()}
        type="button"
        style={{ marginTop: 4 }}
      >
        {saving ? 'Зберігаємо...' : product ? 'Зберегти зміни' : 'Створити товар'}
      </button>
    </>
  );
}