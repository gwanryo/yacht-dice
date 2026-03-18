interface Props {
  dice: number[];
  held: boolean[];
  rollCount: number;
  isMyTurn: boolean;
  onHold: (index: number) => void;
}

export default function DiceTray({ dice, held, rollCount, isMyTurn, onHold }: Props) {
  const canInteract = isMyTurn && rollCount > 0;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Dice result buttons */}
      {rollCount > 0 && dice.length === 5 && (
        <div className="flex gap-3">
          {dice.map((d, i) => (
            <button
              key={i}
              onClick={() => canInteract && !held[i] && onHold(i)}
              disabled={!canInteract || held[i]}
              aria-label={`Dice ${i + 1}: ${d}${held[i] ? ' (held)' : ''}`}
              className={`w-12 h-12 rounded-lg text-lg font-bold transition-all duration-300 ${
                held[i]
                  ? 'opacity-30 scale-75'
                  : canInteract
                    ? 'bg-white/20 text-white hover:bg-white/30 backdrop-blur cursor-pointer'
                    : 'bg-white/10 text-white/60'
              }`}
            >
              {held[i] ? '' : d}
            </button>
          ))}
        </div>
      )}

      {/* Wood tray */}
      <div
        className="flex gap-2.5 justify-center px-4 py-3 rounded-xl"
        style={{
          background: 'linear-gradient(135deg, #3d2b1f, #5c4033)',
          border: '2px solid #7c5e4a',
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const heldIndex = dice.findIndex((_, di) => held[di] && getHeldSlot(held, di) === i);
          const heldValue = heldIndex >= 0 ? dice[heldIndex] : null;

          return (
            <button
              key={i}
              onClick={() => {
                if (heldValue !== null && canInteract) {
                  onHold(heldIndex);
                }
              }}
              disabled={!canInteract || heldValue === null}
              className={`w-11 h-11 rounded-lg flex items-center justify-center font-bold text-lg transition-all duration-300 ${
                heldValue !== null
                  ? 'bg-white text-gray-900 shadow-md cursor-pointer hover:scale-105'
                  : 'bg-white/10 border-2 border-dashed border-white/20'
              }`}
            >
              {heldValue}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getHeldSlot(held: boolean[], diceIndex: number): number {
  let slot = 0;
  for (let i = 0; i < diceIndex; i++) {
    if (held[i]) slot++;
  }
  return slot;
}
