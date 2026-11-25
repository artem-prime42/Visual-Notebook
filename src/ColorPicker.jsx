import React, { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { tr } from './i18n.js';

const colors = [
  '#818cf8', '#60a5fa', '#38bdf8', '#2dd4bf', '#34d399', '#a3e635',
  '#facc15', '#fb923c', '#fb7185', '#f472b6', '#c084fc', '#a1a1aa',
  '#475569', '#365a74', '#3d6652', '#76533d', '#754357', '#eee9dc',
];

export default function ColorPicker({ value, onChange, language = 'ru', showLabel = false }) {
  const [open, setOpen] = useState(false);
  return <div className={`color-picker ${open ? 'is-open' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
    <button className="color-picker-trigger" aria-label={tr(language, 'panel.blockColor')} title={tr(language, 'panel.blockColor')} onClick={() => setOpen((state) => !state)}>
      <Palette size={14} /><span className="color-preview" style={{ backgroundColor: value || '#25282d' }} />{showLabel && <span>{tr(language, 'context.changeColor')}</span>}
    </button>
    {open && <div className="color-picker-popover">
      <div className="color-picker-label">{tr(language, 'panel.blockColor')}</div>
      <div className="color-swatches">{colors.map((color) => <button key={color} className={`color-swatch ${value?.toLowerCase() === color ? 'chosen' : ''}`} style={{ backgroundColor: color }} title={color} aria-label={color} onClick={() => { onChange(color); setOpen(false); }}>
        {value?.toLowerCase() === color && <Check size={12} />}
      </button>)}</div>
      <label className="custom-color-row"><span>{tr(language, 'panel.customColor')}</span><span className="custom-color-well" style={{ backgroundColor: value || '#25282d' }}><input type="color" value={value || '#25282d'} aria-label={tr(language, 'panel.customColor')} onChange={(event) => onChange(event.target.value)} /></span></label>
    </div>}
  </div>;
}
