'use client';

import Image from 'next/image';
import type { CatalogProduct } from '@/lib/api';
import Spinner from '@/components/ui/spinner';

interface AdminPageProps {
  products: CatalogProduct[];
  loading: boolean;
  onCreate: () => void;
  onEdit: (p: CatalogProduct) => void;
  onToggle: (id: number) => Promise<void>;
}

export default function AdminPage({ products, loading, onCreate, onEdit, onToggle }: AdminPageProps) {
  if (loading) return <Spinner />;

  return (
    <>
      <button className="btn-primary" onClick={onCreate} type="button" style={{ marginBottom: 16 }}>
        + Додати товар
      </button>

      {products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-text">Товарів ще немає</div>
        </div>
      ) : (
        <div className="card">
          {products.map((p, idx) => (
            <div key={p.id}>
              {idx > 0 && <div className="divider" />}
              <div className="admin-product-item" onClick={() => onEdit(p)}>
                <div className="admin-product-image">
                  {p.photo_url ? (
                    <Image
                      src={p.photo_url}
                      alt={p.title}
                      fill
                      unoptimized
                      sizes="48px"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="product-image-placeholder" style={{ fontSize: '0.6rem' }}>
                      Фото
                    </div>
                  )}
                </div>

                <div className="admin-product-info">
                  <div className="admin-product-title">{p.title}</div>
                  <div className="admin-product-sizes">
                    {p.sizes.map(s => `${s.size}: ${s.price}₴`).join(', ')}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span className={`status-badge ${p.is_active ? 'active' : 'archived'}`}>
                    {p.is_active ? 'Активний' : 'Архів'}
                  </span>
                  <button
                    className={`btn-secondary btn-small ${p.is_active ? 'btn-danger' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      onToggle(p.id);
                    }}
                    type="button"
                  >
                    {p.is_active ? 'Архів' : 'Активувати'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}