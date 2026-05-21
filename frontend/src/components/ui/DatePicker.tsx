import React, { useEffect, useId, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import '../../assets/css/DatePicker.css';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIso(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoFromParts(dateKey: string, time = '23:59') {
  const [y, m, day] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const d = new Date(y, m - 1, day, hh, mm, 0, 0);
  return d.toISOString();
}

function formatDisplay(iso?: string | null, showTime?: boolean) {
  const d = parseIso(iso);
  if (!d) return '';
  return showTime
    ? d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildMonthGrid(view: Date) {
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export interface DatePickerProps {
  value?: string | null;
  onChange: (iso: string | null) => void;
  label?: string;
  placeholder?: string;
  minDate?: Date;
  showTime?: boolean;
  clearable?: boolean;
  id?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select date',
  minDate,
  showTime = false,
  clearable = true,
  id: idProp,
}) => {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());
  const [time, setTime] = useState(() => {
    const d = parseIso(value);
    return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '23:59';
  });

  useEffect(() => {
    if (selected) setViewMonth(selected);
    if (selected && showTime) {
      setTime(`${pad(selected.getHours())}:${pad(selected.getMinutes())}`);
    }
  }, [value, showTime]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pickDay = (day: Date) => {
    if (minDate && day < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) {
      return;
    }
    onChange(isoFromParts(toDateKey(day), showTime ? time : '23:59'));
    if (!showTime) setOpen(false);
  };

  const applyTime = (t: string) => {
    setTime(t);
    if (selected) onChange(isoFromParts(toDateKey(selected), t));
  };

  const cells = buildMonthGrid(viewMonth);
  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="date-picker" ref={rootRef}>
      {label && (
        <label className="date-picker__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="date-picker__control">
        <button
          type="button"
          id={id}
          className={`date-picker__trigger ${!value ? 'is-empty' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Calendar size={18} className="date-picker__icon" aria-hidden />
          <span>{value ? formatDisplay(value, showTime) : placeholder}</span>
        </button>
        {clearable && value && (
          <button
            type="button"
            className="date-picker__clear"
            onClick={() => onChange(null)}
            aria-label="Clear date"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {open && (
        <div className="date-picker__popover" role="dialog" aria-label={label ?? 'Choose date'}>
          <div className="date-picker__header">
            <button
              type="button"
              className="date-picker__nav"
              onClick={() =>
                setViewMonth(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))
              }
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="date-picker__month">{monthLabel}</span>
            <button
              type="button"
              className="date-picker__nav"
              onClick={() =>
                setViewMonth(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))
              }
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="date-picker__weekdays">
            {WEEKDAYS.map(w => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="date-picker__grid">
            {cells.map((day, i) => {
              if (!day) return <span key={`e-${i}`} className="date-picker__day empty" />;
              const key = toDateKey(day);
              const isSelected = selected && toDateKey(selected) === key;
              const isToday = toDateKey(new Date()) === key;
              const isDisabled =
                minDate && day < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    'date-picker__day',
                    isSelected ? 'selected' : '',
                    isToday ? 'today' : '',
                    isDisabled ? 'disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={isDisabled}
                  onClick={() => pickDay(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          {showTime && (
            <div className="date-picker__time">
              <label htmlFor={`${id}-time`}>Time</label>
              <input
                id={`${id}-time`}
                type="time"
                value={time}
                onChange={e => applyTime(e.target.value)}
              />
            </div>
          )}
          <div className="date-picker__footer">
            <button type="button" className="date-picker__today" onClick={() => pickDay(new Date())}>
              Today
            </button>
            <button type="button" className="date-picker__done" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
