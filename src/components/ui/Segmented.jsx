// A row of mutually exclusive buttons, like radio buttons.
//   options: [[value, text], ...]

export function Segmented({ label, options, value, onChange, disabled = false, className = '' }) {
  return (
    <div className={`seg ${className}`} role="group" aria-label={label}>
      {options.map(([val, text]) => (
        <button
          key={val}
          type="button"
          aria-pressed={val === value}
          disabled={disabled}
          onClick={() => onChange(val)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
