type AdminEditPageProps = {
  title: string;
  description: string;
  sizes: string;
  requiresColor: boolean;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setSizes: (value: string) => void;
  setRequiresColor: (value: boolean) => void;
  setPhoto: (file: File | null) => void;
  setPhotoBlack: (file: File | null) => void;
  onSave: () => void;
};

export default function AdminEditPage(props: AdminEditPageProps) {
  const {
    title,
    description,
    sizes,
    requiresColor,
    setTitle,
    setDescription,
    setSizes,
    setRequiresColor,
    setPhoto,
    setPhotoBlack,
    onSave,
  } = props;

  return (
    <div className="stack">
      <input className="input" placeholder="Назва" value={title} onChange={(event) => setTitle(event.target.value)} />
      <textarea className="input" placeholder="Опис" value={description} onChange={(event) => setDescription(event.target.value)} />
      <input className="input" placeholder="S:500, M:550" value={sizes} onChange={(event) => setSizes(event.target.value)} />
      <label className="checkboxRow">
        <input type="checkbox" checked={requiresColor} onChange={(event) => setRequiresColor(event.target.checked)} />
        Є кольори (білий/чорний)
      </label>
      <input className="input" type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
      {requiresColor && <input className="input" type="file" accept="image/*" onChange={(event) => setPhotoBlack(event.target.files?.[0] ?? null)} />}
      <button className="mainBtn" onClick={onSave}>Зберегти</button>
    </div>
  );
}
