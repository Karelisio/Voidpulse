/** Objectifs : quêtes du jour et de la semaine, passe de saison, succès. */
export function GoalsScreen({ onBack }: { onBack: () => void }) {
  return (
    <main className="select">
      <h2>Objectifs</h2>
      <button className="btn-ghost" onClick={onBack}>
        Retour
      </button>
    </main>
  );
}
