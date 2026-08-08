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
    if (product && product.variants.length > 0) {
      const initialColor = product.requires_color ? (product.variants[0].color ?? 'Білий') : 'Білий';
      const relevantVariants = product.requires_color
        ? product.variants.filter(v => v.color === initialColor)
        : product.variants;
      
      setSelectedSize(relevantVariants[0]?.size ?? '');
      setSelectedColor(initialColor as 'Білий' | 'Чорний');
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

  const colors = Array.from(new Set(product.variants.map(v => v.color).filter(Boolean))) as ('Білий' | 'Чорний')[];
  const relevantVariants = product.requires_color
    ? product.variants.filter(v => v.color === selectedColor)
    : product.variants;

  const selectedVariant = relevantVariants.find(v => v.size === selectedSize);
  const selectedPrice = selectedVariant?.price ?? 0;
  const maxAvailable = selectedVariant?.quantity !== null ? Math.max(0, (selectedVariant?.quantity ?? 0) - (selectedVariant?.reserved ?? 0)) : MAX_QUANTITY;

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
            {colors.length > 0 ? colors.map(color => (
              <button
                key={color}
                className={`size-btn ${selectedColor === color ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedColor(color);
                  const newRelevant = product.variants.filter(v => v.color === color);
                  if (newRelevant.length > 0 && !newRelevant.find(v => v.size === selectedSize)) {
                    setSelectedSize(newRelevant[0].size);
                  }
                }}
                type="button"
              >
                <span className="size-label">{color}</span>
              </button>
            )) : <span className="size-label">Немає варіантів кольору</span>}
          </div>
        </>
      )}

      <p className="section-title">Оберіть розмір</p>
      <div className="size-selector">
        {relevantVariants.map(v => {
          const available = v.quantity !== null ? Math.max(0, v.quantity - v.reserved) : null;
          const isOutOfStock = available === 0;
          return (
            <button
              key={v.size}
              className={`size-btn ${selectedSize === v.size ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}
              onClick={() => {
                if (!isOutOfStock) setSelectedSize(v.size);
              }}
              type="button"
              disabled={isOutOfStock}
              style={isOutOfStock ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              <span className="size-label">{v.size}</span>
              <span className="size-price">{v.price} грн</span>
              {available !== null ? (
                <span className="size-qty" style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                  {isOutOfStock ? 'Немає в наявності' : `${available} шт`}
                </span>
              ) : (
                <span className="size-qty" style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                  Передзамовлення
                </span>
              )}
            </button>
          );
        })}
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
          onClick={() => setQuantity(q => Math.min(maxAvailable, q + 1))}
          disabled={quantity >= maxAvailable}
          type="button"
          aria-label="Збільшити кількість"
        >
          +
        </button>
      </div>

      <button
        className="btn-primary"
        onClick={handleAdd}
        disabled={!selectedSize || adding || maxAvailable === 0}
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
