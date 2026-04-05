'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { CatalogProduct } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/api';
import Spinner from '@/components/ui/spinner';

interface ProductPageProps {
  product: CatalogProduct | null;
  loading: boolean;
  onAddToCart: (size: string, color: string | null) => Promise<void>;
}

export default function ProductPage({ product, loading, onAddToCart }: ProductPageProps) {
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState<'Білий' | 'Чорний'>('Білий');
  const [adding, setAdding] = useState(false);

  // Reset on product change
  const [prevId, setPrevId] = useState<number | null>(null);
  if (product && product.id !== prevId) {
    setPrevId(product.id);
    setSelectedSize(product.sizes[0]?.size ?? '');
    setSelectedColor('Білий');
  }

  if (loading) return <Spinner />;
  if (!product) return null;

  const photoUrl =
    selectedColor === 'Чорний' && product.photo_black_url
      ? product.photo_black_url
      : product.photo_url;
  const resolvedPhotoUrl = resolveMediaUrl(photoUrl);

  const handleAdd = async () => {
    if (!selectedSize) return;
    setAdding(true);
    try {
      await onAddToCart(selectedSize, product.requires_color ? selectedColor : null);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="page-enter">
      {resolvedPhotoUrl && (
        <div className="product-detail-image-wrap">
          <Image
            src={resolvedPhotoUrl}
            alt={product.title}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, 600px"
            style={{ objectFit: 'cover' }}
            priority
          />
        </div>
      )}

      <h1 className="product-detail-title">{product.title}</h1>
      <p className="product-detail-description">{product.description}</p>

      {product.requires_color && (
        <>
          <p className="section-title">Оберіть колір</p>
          <div className="size-selector">
            {(['Білий', 'Чорний'] as const).map(color => (
              <button
                key={color}
                className={`size-btn ${selectedColor === color ? 'selected' : ''}`}
                onClick={() => setSelectedColor(color)}
                type="button"
              >
                <span className="size-label">{color}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <p className="section-title">Оберіть розмір</p>
      <div className="size-selector">
        {product.sizes.map(s => (
          <button
            key={s.size}
            className={`size-btn ${selectedSize === s.size ? 'selected' : ''}`}
            onClick={() => setSelectedSize(s.size)}
            type="button"
          >
            <span className="size-label">{s.size}</span>
            <span className="size-price">{s.price} грн</span>
          </button>
        ))}
      </div>

      <button
        className="btn-primary"
        onClick={handleAdd}
        disabled={!selectedSize || adding}
        type="button"
      >
        {adding ? 'Додаємо...' : 'Додати до кошика'}
      </button>
    </div>
  );
}