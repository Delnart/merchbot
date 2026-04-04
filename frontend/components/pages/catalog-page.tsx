import Image from "next/image";

import type { CatalogProduct } from "@/lib/api";

type CatalogPageProps = {
  products: CatalogProduct[];
  onOpenProduct: (productId: number) => void;
};

export default function CatalogPage({ products, onOpenProduct }: CatalogPageProps) {
  return (
    <div className="catalogGrid">
      {products.map((product) => (
        <article className="productCard" key={product.id} onClick={() => onOpenProduct(product.id)}>
          {product.photo_url ? (
            <div className="productImageWrap">
              <Image className="productImage" src={product.photo_url} alt={product.title} fill unoptimized sizes="(max-width: 768px) 50vw, 240px" />
            </div>
          ) : (
            <div className="productImageWrap">
              <div className="productImageFallback">Без фото</div>
            </div>
          )}
          <h2>{product.title}</h2>
          <p>{product.description}</p>
          <div className="priceRow">
            <span>від {product.min_price} грн</span>
            <span>{product.sizes.map((size) => size.size).join(" · ")}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
