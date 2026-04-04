import type { CartResponse } from "@/lib/api";

type CartPageProps = {
  cart: CartResponse;
  onUpdateQty: (itemId: number, quantity: number) => void;
  onOpenCheckout: () => void;
};

export default function CartPage({ cart, onUpdateQty, onOpenCheckout }: CartPageProps) {
  return (
    <div className="stack">
      {!cart.items.length && <p>Кошик порожній.</p>}
      {cart.items.map((item) => (
        <div className="cartRow" key={item.id}>
          <div>
            <h3>{item.title}</h3>
            <p>{item.size}{item.color ? ` / ${item.color}` : ""}</p>
            <p>{item.line_total} грн</p>
          </div>
          <div className="inlineButtons">
            <button className="chip" onClick={() => onUpdateQty(item.id, item.quantity - 1)}>-</button>
            <span>{item.quantity}</span>
            <button className="chip" onClick={() => onUpdateQty(item.id, item.quantity + 1)}>+</button>
          </div>
        </div>
      ))}
      {!!cart.items.length && <p className="totalLine">Разом: {cart.total} грн</p>}
      {!!cart.items.length && <button className="mainBtn" onClick={onOpenCheckout}>Оформити</button>}
    </div>
  );
}
