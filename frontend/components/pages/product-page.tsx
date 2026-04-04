import Image from "next/image";

import type { CatalogProduct } from "@/lib/api";

type ProductPageProps = {
  product: CatalogProduct;
  selectedSize: string;
  selectedColor: string;
  setSelectedSize: (value: string) => void;
  setSelectedColor: (value: string) => void;
  onAddToCart: () => void;
};

export default function ProductPage({
  product,
  selectedSize,
  selectedColor,
  setSelectedSize,
  setSelectedColor,
  onAddToCart,
}: ProductPageProps) {
  return (
    <div className="stack">
      {product.photo_url && (
        <div className="heroImageWrap">
          <Image
            className="heroImage"
            src={selectedColor === "Чорний" && product.photo_black_url ? product.photo_black_url : product.photo_url}
            alt={product.title}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 960px"
          />
        </div>
      )}
      <p>{product.description}</p>

      {product.requires_color && (
        <div className="inlineButtons">
          <button className={selectedColor === "Білий" ? "chip active" : "chip"} onClick={() => setSelectedColor("Білий")}>Білий</button>
          <button className={selectedColor === "Чорний" ? "chip active" : "chip"} onClick={() => setSelectedColor("Чорний")}>Чорний</button>
        </div>
      )}

      <div className="inlineButtons">
        {product.sizes.map((size) => (
          <button key={size.size} className={selectedSize === size.size ? "chip active" : "chip"} onClick={() => setSelectedSize(size.size)}>
            {size.size} · {size.price} грн
          </button>
        ))}
      </div>

      <button className="mainBtn" onClick={onAddToCart}>Додати до кошика</button>
    </div>
  );
}
