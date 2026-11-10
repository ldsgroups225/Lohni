import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { chatJSON } from "../../lib/api";

const labels: Record<string, string> = { Mathematics: 'Mathématiques', English: 'Anglais', Science: 'Sciences', History: 'Histoire', Geography: 'Géographie', Music: 'Musique', Art: 'Arts', Technology: 'Technologie', Philosophy: 'Philosophie' };

export default function ExploreTopics() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const moreRows = useMemo(
    () => [
      ["History", "Geography", "Music"],
      ["Art", "Technology", "Philosophy"],
    ],
    []
  );

  const imgSrc = (title: string) => `/pictures/${encodeURIComponent(title.toLocaleLowerCase())}.png`;

  const promptFor = (topic: string) =>
    `Explique-moi en français les bases de ce sujet : ${labels[topic]}.`;

  const startTopic = async (title: string) => {
    if (busy) return;
    try {
      setBusy(true);
      setError('');
      const q = promptFor(title);
      const r = await chatJSON({ q });
      navigate(`/chat?chatId=${encodeURIComponent(r.chatId)}&q=${encodeURIComponent(q)}`, {
        state: { chatId: r.chatId, q },
      });
    } catch {
      setError('Impossible de joindre le Tuteur. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const Card = ({ title, extra }: { title: string; extra?: string }) => (
    <button
      type="button"
      onClick={() => startTopic(title)}
      disabled={busy}
      className={`w-full h-32 sm:h-48 relative rounded-3xl border border-stone-900 bg-stone-950 
                  md:hover:scale-105 active:scale-95 transition-transform duration-200 ease-out 
                  focus:outline-none focus:ring-2 focus:ring-stone-700 disabled:opacity-60 ${extra || ""}`}
      title={busy ? "Démarrage…" : `Découvrir : ${labels[title]}`}
    >
      <img src={imgSrc(title)} alt="" className="w-full h-full rounded-3xl object-cover" loading="lazy" draggable={false} />
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-transparent to-black" />
      <div className="absolute left-0 bottom-0 pl-4 pb-3 text-left text-stone-100 text-lg sm:text-2xl font-medium">{labels[title]}</div>
    </button>
  );

  return (
    <div className="mt-auto pb-4 pt-4 relative">
      {error && <p role="alert" className="text-center text-red-300">{error}</p>}
      <button type="button" aria-expanded={open} className="w-fit flex flex-col items-center mx-auto mb-5 md:mb-8 py-2 cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="size-6"
          style={{
            transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <path
            fillRule="evenodd"
            d="M9.47 6.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06l4.25-4.25Z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm">{busy ? "Démarrage…" : "EXPLORER LES SUJETS"}</span>
      </button>

      <div className="w-full max-w-4xl mx-auto overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-3 md:mb-4">
          <Card title="Mathematics" />
          <Card title="English" />
          <Card title="Science" extra="col-span-2 md:col-span-1" />
        </div>

        <div
          className="overflow-hidden"
          style={{
            transition: "max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
            maxHeight: open ? 1000 : 0
          }}
        >
          {moreRows.map((row, i) => (
            <div key={i} className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              {row.map((title, j) => (
                <Card key={title} title={title} extra={j === 2 ? "col-span-2 md:col-span-1" : ""} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div
        className="absolute w-full h-full bottom-0 bg-gradient-to-b from-transparent to-black/80 pointer-events-none"
        style={{
          transition: "opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: open ? 0 : 1
        }}
      />
    </div>
  );
}
