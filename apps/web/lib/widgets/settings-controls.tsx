"use client";

/** Controlled-by-parent text field that commits once the user leaves it. */
export function TextSetting({
  label,
  value,
  disabled,
  maxLength,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  maxLength?: number;
  onCommit: (next: string) => void;
}) {
  return (
    <label className="app-field">
      <span>{label}</span>
      <input
        key={value}
        className="app-input"
        defaultValue={value}
        maxLength={maxLength}
        disabled={disabled}
        onBlur={(event) => {
          const next = event.currentTarget.value.trim();
          if (next === value) return;
          onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.currentTarget.value = value;
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
