import type { CatalogProduct } from "@/lib/api";

type AdminPageProps = {
  products: CatalogProduct[];
  onCreate: () => void;
  onEdit: (product: CatalogProduct) => void;
  onToggle: (productId: number) => void;
};

export default function AdminPage({ products, onCreate, onEdit, onToggle }: AdminPageProps) {
  return (
    <div className="stack">
      <button className="mainBtn" onClick={onCreate}>Додати товар</button>
      {products.map((product) => (
        <div className="cartRow" key={product.id}>
          <div>
            <h3>{product.title}</h3>
            <p>{product.sizes.map((size) => `${size.size}:${size.price}`).join(", ")}</p>
          </div>
          <div className="inlineButtons wrap">
            <button className="chip" onClick={() => onEdit(product)}>Редагувати</button>
            <button className="chip" onClick={() => onToggle(product.id)}>{product.is_active ? "Архів" : "Активувати"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
