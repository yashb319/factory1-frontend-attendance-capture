type Props = {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
};

export function Segmented({ value, options, onChange }: Props) {
  return (
    <div className="segmented">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          className={value === optionValue ? "active" : ""}
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
