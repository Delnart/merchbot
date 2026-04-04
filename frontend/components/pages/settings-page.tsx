import type { Order, Recipient } from "@/lib/api";

type SettingsPageProps = {
  recipients: Recipient[];
  orders: Order[];
  newRecipientName: string;
  setNewRecipientName: (value: string) => void;
  newRecipientPhone: string;
  setNewRecipientPhone: (value: string) => void;
  onSetDefaultRecipient: (recipientId: number) => void;
  onDeleteRecipient: (recipientId: number) => void;
  onCreateRecipient: () => void;
  statusLabel: (status: string) => string;
};

export default function SettingsPage(props: SettingsPageProps) {
  const {
    recipients,
    orders,
    newRecipientName,
    setNewRecipientName,
    newRecipientPhone,
    setNewRecipientPhone,
    onSetDefaultRecipient,
    onDeleteRecipient,
    onCreateRecipient,
    statusLabel,
  } = props;

  return (
    <div className="stack">
      <h2>Отримувачі</h2>
      {recipients.map((recipient) => (
        <div className="cartRow" key={recipient.id}>
          <div>
            <h3>{recipient.full_name}</h3>
            <p>{recipient.phone}</p>
          </div>
          <div className="inlineButtons wrap">
            {!recipient.is_default && <button className="chip" onClick={() => onSetDefaultRecipient(recipient.id)}>За замовч.</button>}
            <button className="chip danger" onClick={() => onDeleteRecipient(recipient.id)}>Видалити</button>
          </div>
        </div>
      ))}

      <h2>Історія замовлень</h2>
      {orders.map((order) => (
        <div className="cartRow" key={order.id}>
          <div>
            <h3>#{order.id} · {order.total_amount} грн</h3>
            <p>{order.created_at.split("T")[0]}</p>
          </div>
          <span className="chip active">{statusLabel(order.status)}</span>
        </div>
      ))}

      <h2>Новий отримувач</h2>
      <input className="input" placeholder="ПІБ" value={newRecipientName} onChange={(event) => setNewRecipientName(event.target.value)} />
      <input className="input" placeholder="Телефон" value={newRecipientPhone} onChange={(event) => setNewRecipientPhone(event.target.value)} />
      <button className="mainBtn" onClick={onCreateRecipient}>Додати</button>
    </div>
  );
}
