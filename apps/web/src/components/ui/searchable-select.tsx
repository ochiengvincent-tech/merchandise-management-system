import { useId, useRef, useState } from "react";

type SearchableOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  id: string;
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-invalid"?: boolean;
};

export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  placeholder = "Type to search…",
  emptyMessage = "No matching options",
  disabled = false,
  required = false,
  "aria-invalid": ariaInvalid,
}: SearchableSelectProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const enabledOptions = filteredOptions.filter((option) => !option.disabled);
  const activeOption = enabledOptions[activeIndex];
  const inputValue = isOpen ? query : selectedOption?.label ?? "";

  const closeMenu = () => {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.setCustomValidity("");
  };

  const selectOption = (option: SearchableOption) => {
    if (option.disabled) return;
    onChange(option.value);
    closeMenu();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setQuery("");
        setActiveIndex(0);
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, enabledOptions.length - 1));
    } else if (event.key === "ArrowUp" && isOpen) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && isOpen && activeOption) {
      event.preventDefault();
      selectOption(activeOption);
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMenu();
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={activeOption ? `${listboxId}-${activeIndex}` : undefined}
        aria-invalid={ariaInvalid}
        autoComplete="off"
        disabled={disabled}
        required={required && !value}
        value={inputValue}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        onFocus={() => {
          setIsOpen(true);
          setQuery("");
        }}
        onBlur={() => {
          if (required && query.trim()) {
            inputRef.current?.setCustomValidity("Choose an option from the list.");
          } else {
            inputRef.current?.setCustomValidity("");
          }
          setIsOpen(false);
          setQuery("");
          setActiveIndex(0);
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);
          setActiveIndex(0);
          if (required && nextQuery.trim()) {
            event.currentTarget.setCustomValidity("Choose an option from the list.");
          } else {
            event.currentTarget.setCustomValidity("");
          }
        }}
        onKeyDown={handleKeyDown}
      />

      {isOpen && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Options"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {enabledOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">{emptyMessage}</p>
          ) : (
            enabledOptions.map((option, index) => (
              <button
                key={option.value}
                id={`${listboxId}-${index}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  index === activeIndex
                    ? "bg-blue-50 text-blue-900"
                    : "text-slate-800 hover:bg-slate-50"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
