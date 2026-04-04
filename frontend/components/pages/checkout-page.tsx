import type { CartResponse, Recipient, ShopConfig } from "@/lib/api";

type CheckoutPageProps = {
  cart: CartResponse;
  config: ShopConfig;
  recipients: Recipient[];
  recipientId: number | null;
  setRecipientId: (id: number | null) => void;
  newRecipientName: string;
  setNewRecipientName: (value: string) => void;
  newRecipientPhone: string;
  setNewRecipientPhone: (value: string) => void;
  saveRecipient: boolean;
  setSaveRecipient: (value: boolean) => void;
  deliveryMethod: string;
  setDeliveryMethod: (value: string) => void;
  deliveryAddress: string;
  setDeliveryAddress: (value: string) => void;
  setReceiptFile: (file: File | null) => void;
  onSubmit: () => void;
};

export default function CheckoutPage(props: CheckoutPageProps) {
  const {
    cart,
    config,
    recipients,
    recipientId,
    setRecipientId,
    newRecipientName,
    setNewRecipientName,
    newRecipientPhone,
    setNewRecipientPhone,
    saveRecipient,
    setSaveRecipient,
    deliveryMethod,
    setDeliveryMethod,
    deliveryAddress,
    setDeliveryAddress,
    setReceiptFile,
    onSubmit,
  } = props;

  return (
    <div className="stack">
      <p>До сплати: {cart.total} грн</p>
      <a className="mainBtn asLink" href={config.mono_jar_url} target="_blank" rel="noreferrer">Відкрити Банку</a>
      {config.card_number && <p>Картка: {config.card_number}</p>}

      {!!recipients.length && (
        <div className="stack">
          {recipients.map((recipient) => (
            <button key={recipient.id} className={recipientId === recipient.id ? "chip active" : "chip"} onClick={() => setRecipientId(recipient.id)}>
              {recipient.full_name} · {recipient.phone}
            </button>
          ))}
          <button className={recipientId === null ? "chip active" : "chip"} onClick={() => setRecipientId(null)}>Інший отримувач</button>
        </div>
      )}

      {recipientId === null && (
        <div className="stack">
          <input className="input" placeholder="ПІБ" value={newRecipientName} onChange={(event) => setNewRecipientName(event.target.value)} />
          <input className="input" placeholder="Телефон" value={newRecipientPhone} onChange={(event) => setNewRecipientPhone(event.target.value)} />
          <label className="checkboxRow">
            <input type="checkbox" checked={saveRecipient} onChange={(event) => setSaveRecipient(event.target.checked)} />
            Зберегти отримувача
          </label>
        </div>
      )}

      <div className="inlineButtons wrap">
        <button className={deliveryMethod === "nova_poshta" ? "chip active" : "chip"} onClick={() => setDeliveryMethod("nova_poshta")}>Нова Пошта</button>
        <button className={deliveryMethod === "campus" ? "chip active" : "chip"} onClick={() => setDeliveryMethod("campus")}>На DayF</button>
        {config.is_dayf_delivery_enabled && <button className={deliveryMethod === "dayf" ? "chip active" : "chip"} onClick={() => setDeliveryMethod("dayf")}>На DayF (день)</button>}
        <button className={deliveryMethod === "later_campus" ? "chip active" : "chip"} onClick={() => setDeliveryMethod("later_campus")}>Пізніше в корпусі</button>
      </div>

      {deliveryMethod === "nova_poshta" && (
        <input className="input" placeholder="Місто та відділення" value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} />
      )}

      <input className="input" type="file" accept="image/*" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} />
      <button className="mainBtn" onClick={onSubmit}>Підтвердити замовлення</button>
    </div>
  );
}
