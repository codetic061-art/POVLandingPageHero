import { SelectionCharacter } from "./illustrations/SelectionCharacter";

export type CharacterChoice = "male" | "female";

export interface BookingDetails {
  name: string;
  character: CharacterChoice;
}

interface BookingSelectionProps {
  formId: string;
  onSubmit: (details: BookingDetails) => void;
  onEdit: () => void;
}

export function BookingSelection({ formId, onSubmit, onEdit }: BookingSelectionProps) {
  return (
    <form
      id={formId}
      className="booking-interface"
      aria-label="Choose your character"
      onChange={onEdit}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const name = String(data.get("name") ?? "").trim();
        const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement;
        input.setCustomValidity(name ? "" : "Please enter your name.");
        if (!event.currentTarget.reportValidity()) return;
        onSubmit({ name, character: data.get("character") as CharacterChoice });
      }}
    >
      <div className="booking-name-field" data-booking-name>
        <h2>
          <label htmlFor={`${formId}-name`}>Enter your name</label>
        </h2>
        <input
          id={`${formId}-name`}
          name="name"
          type="text"
          autoComplete="given-name"
          autoCapitalize="words"
          maxLength={60}
          required
          onInput={(event) => event.currentTarget.setCustomValidity("")}
        />
      </div>

      <fieldset className="booking-cards">
        <legend className="sr-only">Select your character</legend>
        {(["male", "female"] as const).map((character) => (
          <label className="character-card" data-booking-card={character} key={character}>
            <input
              className="character-radio"
              type="radio"
              name="character"
              value={character}
              required
            />
            <span className="character-card-surface">
              <span className="character-selection-mark" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </span>
              <SelectionCharacter variant={character} />
              <span className="character-card-label">
                {character === "male" ? "Male" : "Female"}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* A measured destination, not a second CTA. */}
      <div className="booking-cta-target" aria-hidden="true" />
    </form>
  );
}
