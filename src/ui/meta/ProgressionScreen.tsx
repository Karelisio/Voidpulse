/** Progression permanente : compte et Paragon, talents, reliques, maîtrise, codex. */
export function ProgressionScreen({ onBack }: { onBack: () => void }) {
  return (
    <main className="select">
      <h2>Progression</h2>
      <button className="btn-ghost" onClick={onBack}>
        Retour
      </button>
    </main>
  );
}
