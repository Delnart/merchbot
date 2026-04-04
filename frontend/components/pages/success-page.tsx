type SuccessPageProps = {
  orderId: number | null;
  onBackCatalog: () => void;
};

export default function SuccessPage({ orderId, onBackCatalog }: SuccessPageProps) {
  return (
    <div className="stack centered">
      <h2>Замовлення #{orderId} оформлено</h2>
      <p>Ми перевіримо оплату та повідомимо вас у боті.</p>
      <button className="mainBtn" onClick={onBackCatalog}>До каталогу</button>
    </div>
  );
}
