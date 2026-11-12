import type { ReactNode } from "react";
import { parseLocalizedNumber } from "@nama/dashboard-core";

export interface TextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  onCommit: (value: string) => void;
}

/** Commits on blur or Enter so every committed value is one undo step. */
export function TextField({
  label,
  value,
  placeholder,
  maxLength = 200,
  disabled,
  onCommit,
}: TextFieldProps) {
  return (
    <label className="nama-settings__field">
      <span>{label}</span>
      <input
        key={value}
        className="nama-input"
        defaultValue={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        onBlur={(event) => {
          const next = event.currentTarget.value.trim();
          if (next === value) {
            event.currentTarget.value = value;
            return;
          }
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

export interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}

export function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onCommit,
}: NumberFieldProps) {
  return (
    <label className="nama-settings__field">
      <span>{label}</span>
      <input
        key={value}
        type="text"
        inputMode="decimal"
        dir="ltr"
        className="nama-input"
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const parsed = parseLocalizedNumber(event.currentTarget.value);
          if (parsed === undefined || parsed < min || parsed > max) {
            event.currentTarget.value = String(value);
            return;
          }
          if (parsed !== value) onCommit(parsed);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.currentTarget.value = String(value);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export interface ToggleFieldProps {
  label: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCommit: (checked: boolean) => void;
}

export function ToggleField({ label, checked, disabled, onCommit }: ToggleFieldProps) {
  return (
    <label className="nama-settings__check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCommit(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
