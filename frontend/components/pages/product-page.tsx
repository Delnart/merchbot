'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { CatalogProduct } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/api';
import Spinner from '@/components/ui/spinner';

const MAX_QUANTITY = 99;

interface ProductPageProps {
  product: CatalogProduct | null;
  loading: boolean;
  onAddToCart: (size: string, color: string | null, quantity: number) => Promise<void>;
}

export default function ProductPage({ product, loading, onAddToCart }: ProductPageProps) {
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState<'Білий' | 'Чорний'>('Білий');
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (product) {
      setSelectedSize(product.sizes[0]?.size ?? '');
      setSelectedColor('Білий');
      setQuantity(1);
    }
  }, [product?.id]);

  if (loading) return <Spinner />;
  if (!product) return null;

  const photoUrl =
    selectedColor === 'Чорний' && product.photo_black_url
      ? product.photo_black_url
      : product.photo_url;
  const resolvedPhotoUrl = resolveMediaUrl(photoUrl);

  const selectedPrice = product.sizes.find(s => s.size === selectedSize)?.price ?? 0;

  const handleAdd = async () => {
    if (!selectedSize) return;
    setAdding(true);
    try {
      await onAddToCart(selectedSize, product.requires_color ? selectedColor : null, quantity);
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

      <p className="section-title">Кількість</p>
      <div
        className="qty-control"
        style={{ marginBottom: 16, width: 'fit-content' }}
      >
        <button
          className="qty-btn"
          onClick={() => setQuantity(q => Math.max(1, q - 1))}
          disabled={quantity <= 1}
          type="button"
          aria-label="Зменшити кількість"
        >
          −
        </button>
        <span className="qty-value">{quantity}</span>
        <button
          className="qty-btn"
          onClick={() => setQuantity(q => Math.min(MAX_QUANTITY, q + 1))}
          disabled={quantity >= MAX_QUANTITY}
          type="button"
          aria-label="Збільшити кількість"
        >
          +
        </button>
      </div>

      <button
        className="btn-primary"
        onClick={handleAdd}
        disabled={!selectedSize || adding}
        type="button"
      >
        {adding
          ? 'Додаємо...'
          : quantity > 1
            ? `Додати до кошика · ${quantity} шт · ${selectedPrice * quantity} грн`
            : 'Додати до кошика'}
      </button>
    </div>
  );
}
