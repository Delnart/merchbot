interface SuccessPageProps {
  orderId: number | null;
  onBack: () => void;
}

export default function SuccessPage({ orderId, onBack }: SuccessPageProps) {
  return (
    <div className="success-page">
      <div className="success-icon">✓</div>
      <div className="success-title">Замовлення оформлено</div>
      <div className="success-text">
        {orderId
          ? `Замовлення #${orderId} прийнято. Ми перевіримо оплату та повідомимо вас у боті.`
          : 'Ваше замовлення прийнято. Ми перевіримо оплату та повідомимо вас.'}
      </div>
      <button className="btn-primary" onClick={onBack} type="button" style={{ maxWidth: 280, margin: '0 auto' }}>
        Повернутись до каталогу
      </button>
    </div>
  );
}