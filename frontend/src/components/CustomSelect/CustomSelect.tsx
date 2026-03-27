import { useEffect, useRef, useState } from 'react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function CustomSelect({ value, options, onChange, className, onClick }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div
      ref={ref}
      className={`custom-select${open ? ' custom-select--open' : ''}${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        onClick?.(e);
        setOpen((o) => !o);
      }}
    >
      <div className="custom-select__trigger">
        <span className="custom-select__value">{selected?.label ?? value}</span>
        <span className="custom-select__arrow">▾</span>
      </div>
      {open && (
        <div className="custom-select__menu">
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`custom-select__option${opt.value === value ? ' custom-select__option--selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
