'use client';

import Image from 'next/image';
import type { CatalogProduct } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/api';
import Spinner from '@/components/ui/spinner';

interface CatalogPageProps {
  products: CatalogProduct[];
  loading: boolean;
  onOpenProduct: (id: number) => void;
}

export default function CatalogPage({ products, loading, onOpenProduct }: CatalogPageProps) {
  if (loading && !products.length) {
    return (
      <div className="product-grid">
        {[1, 2, 3, 4].map(i => (
          <article key={i} className="card product-card" style={{ pointerEvents: 'none' }}>
            <div className="product-image-wrap skeleton-bg" />
            <div className="product-info">
              <div className="skeleton-bg" style={{ height: 14, width: '80%', marginBottom: 8, borderRadius: 4 }} />
              <div className="skeleton-bg" style={{ height: 14, width: '40%', borderRadius: 4 }} />
            </div>
          </article>
        ))}
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">—</div>
        <div className="empty-text">Каталог порожній</div>
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map(p => {
        const photoUrl = resolveMediaUrl(p.photo_url);
        return (
        <article
          key={p.id}
          className="card product-card"
          onClick={() => onOpenProduct(p.id)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onOpenProduct(p.id)}
        >
          <div className="product-image-wrap skeleton-bg">
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={p.title}
                fill
                unoptimized
                sizes="(max-width: 640px) 50vw, 240px"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div className="product-image-placeholder">Фото</div>
            )}
          </div>
          <div className="product-info">
            <div className="product-title">{p.title}</div>
            <div className="product-price">від {p.min_price} грн</div>
          </div>
        </article>
        );
      })}
    </div>
  );
}