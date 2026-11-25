import React from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import { useNotebook } from './store.js';
import { tr } from './i18n.js';
import ColorPicker from './ColorPicker.jsx';

function Editable({ value, onChange, className = '', placeholder = '', multiline = false }) {
  const Tag = multiline ? 'textarea' : 'input';
  return <Tag className={className} value={value || ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => event.stopPropagation()} />;
}

function NodeFrame({ id, data, selected, children, className = '', style }) {
  const update = useNotebook((state) => state.updateNodeData);
  const recordHistory = useNotebook((state) => state.recordHistory);
  const language = useNotebook((state) => state.language);
  return (
    <div className={`node-card ${className}`} style={style}>
      <NodeResizer isVisible={selected} minWidth={180} minHeight={80} lineClassName="resize-line" handleClassName="resize-handle" onResizeStart={recordHistory} onResizeEnd={() => useNotebook.getState().setDirty()} />
      <Handle type="target" position={Position.Left} className="connection-handle" />
      <Handle type="source" position={Position.Right} className="connection-handle" />
      {children(update, id, data, language)}
    </div>
  );
}

export function BlockNode(props) {
  const { id, data } = props;
  return <NodeFrame {...props} className="standard-node" style={{ backgroundColor: data.color || '#25282d' }}>
    {(update, _id, _data, language) => <>
      <Editable className="node-title" value={data.title} onChange={(title) => update(id, { title })} placeholder={tr(language, 'node.newBlock')} />
      <Editable className="node-body" value={data.text} onChange={(text) => update(id, { text })} placeholder={tr(language, 'node.description')} multiline />
      <div className="node-color-control"><ColorPicker value={data.color} onChange={(color) => update(id, { color })} language={language} /></div>
    </>}
  </NodeFrame>;
}

export function NoteNode(props) {
  const { id, data } = props;
  return <NodeFrame {...props} className="note-node">
    {(update, _id, _data, language) => <>
      <Editable className="node-title" value={data.title} onChange={(title) => update(id, { title })} placeholder={tr(language, 'node.newNote')} />
      <Editable className="note-body" value={data.text} onChange={(text) => update(id, { text })} placeholder={tr(language, 'node.writeThought')} multiline />
    </>}
  </NodeFrame>;
}

export function HeadingNode(props) {
  const { id, data } = props;
  return <NodeFrame {...props} className="heading-node">
    {(update, _id, _data, language) => <Editable className="heading-input" value={data.title} onChange={(title) => update(id, { title })} placeholder={tr(language, 'node.newSection')} />}
  </NodeFrame>;
}

export function ChecklistNode(props) {
  const { id, data } = props;
  const update = useNotebook((state) => state.updateNodeData);
  const items = data.items || [];
  return <NodeFrame {...props} className="checklist-node">
    {(_setData, _id, _data, language) => <>
      <Editable className="node-title" value={data.title} onChange={(title) => update(id, { title })} placeholder={tr(language, 'node.tasks')} />
      <div className="check-items">{items.map((item, index) => <div className="check-item" key={`${id}-${index}`}>
        <input type="checkbox" checked={!!item.done} onChange={(event) => update(id, { items: items.map((entry, i) => i === index ? { ...entry, done: event.target.checked } : entry) })} />
        <input value={typeof item === 'string' ? item : item.text} className={item.done ? 'checked-text' : ''} onChange={(event) => update(id, { items: items.map((entry, i) => i === index ? { ...(typeof entry === 'string' ? { text: entry } : entry), text: event.target.value } : entry) })} onKeyDown={(event) => event.stopPropagation()} />
        <button className="remove-check" onClick={() => update(id, { items: items.filter((_, i) => i !== index) })} aria-label={tr(language, 'node.removeTask')}>×</button>
      </div>)}</div>
      <button className="add-check" onClick={() => update(id, { items: [...items, { text: tr(language, 'node.newTask'), done: false }] })}>{tr(language, 'node.addTask')}</button>
    </>}
  </NodeFrame>;
}

export function GroupNode(props) {
  const { id, data } = props;
  return <NodeFrame {...props} className="group-node">
    {(update, _id, _data, language) => <>
      <Editable className="group-title" value={data.title} onChange={(title) => update(id, { title })} placeholder={tr(language, 'node.group')} />
      <Editable className="group-description" value={data.text} onChange={(text) => update(id, { text })} placeholder={tr(language, 'node.groupDescription')} multiline />
    </>}
  </NodeFrame>;
}
