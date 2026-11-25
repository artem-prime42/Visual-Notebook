import { create } from 'zustand';
import { tr } from './i18n.js';

const defaultCanvas = { showGrid: true, snapToGrid: false, gridSize: 20 };
const initialNodes = [
  { id: 'welcome', type: 'block', position: { x: 120, y: 120 }, data: { title: 'Visual Notebook', text: 'Создавайте заметки, связывайте идеи и стройте схемы на бесконечном холсте.', color: '#25282d' }, style: { width: 280, height: 170 } },
  { id: 'idea', type: 'note', position: { x: 500, y: 105 }, data: { title: 'Идея', text: 'Перетащите блоки, соедините их за круглые точки и исследуйте свои мысли.' }, style: { width: 270, height: 190 } },
];

const clone = (value) => JSON.parse(JSON.stringify(value));
let lastNodeDataUpdateAt = 0;
function snapshot(state) {
  return { nodes: state.nodes, edges: state.edges, settings: state.settings, viewport: state.viewport };
}
function historyUpdate(set, get, update) {
  lastNodeDataUpdateAt = 0;
  const state = get();
  const past = [...state.past, clone(snapshot(state))].slice(-80);
  set({ ...update(state), past, future: [] });
}

export const useNotebook = create((set, get) => ({
  language: typeof localStorage === 'undefined' ? 'ru' : localStorage.getItem('visual-notebook-language') || 'ru',
  theme: typeof localStorage === 'undefined' ? 'midnight' : localStorage.getItem('visual-notebook-theme') || 'midnight',
  setLanguage: (language) => {
    localStorage.setItem('visual-notebook-language', language);
    set({ language });
  },
  setTheme: (theme) => {
    localStorage.setItem('visual-notebook-theme', theme);
    set({ theme });
  },
  nodes: initialNodes,
  edges: [],
  settings: { ...defaultCanvas },
  viewport: { x: 0, y: 0, zoom: 1 },
  filePath: null,
  dirty: false,
  past: [],
  future: [],
  clipboard: null,
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setViewport: (viewport) => set({ viewport }),
  setFilePath: (filePath) => set({ filePath }),
  setDirty: (dirty = true) => set({ dirty }),
  recordHistory: () => {
    lastNodeDataUpdateAt = 0;
    set((state) => ({ past: [...state.past, clone(snapshot(state))].slice(-80), future: [] }));
  },
  updateNodeData: (id, patch) => {
    const now = Date.now();
    const update = (state) => ({
      nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node), dirty: true,
    });
    if (now - lastNodeDataUpdateAt < 750) set(update);
    else historyUpdate(set, get, update);
    lastNodeDataUpdateAt = now;
  },
  addNode: (type, position) => {
    const language = get().language;
    const defaults = {
      block: { title: tr(language, 'node.newBlock'), text: tr(language, 'node.description'), color: '#25282d' },
      note: { title: tr(language, 'node.newNote'), text: tr(language, 'node.writeThought') },
      heading: { title: tr(language, 'node.newSection'), text: '' },
      checklist: { title: tr(language, 'node.tasks'), items: [{ text: tr(language, 'node.firstTask'), done: false }, { text: tr(language, 'node.secondTask'), done: false }] },
      group: { title: tr(language, 'node.group'), text: tr(language, 'node.groupDescription') },
    };
    const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const sizes = { block: [260, 170], note: [280, 200], heading: [320, 90], checklist: [270, 210], group: [400, 280] };
    historyUpdate(set, get, (state) => ({
      nodes: [...state.nodes, { id, type, position, data: defaults[type], style: { width: sizes[type][0], height: sizes[type][1] } }],
      dirty: true,
    }));
    return id;
  },
  groupSelected: (title = 'Group') => historyUpdate(set, get, (state) => {
    const selected = state.nodes.filter((node) => node.selected && node.type !== 'group');
    if (selected.length < 2) return { nodes: state.nodes, dirty: state.dirty };
    const left = Math.min(...selected.map((node) => node.position.x));
    const top = Math.min(...selected.map((node) => node.position.y));
    const right = Math.max(...selected.map((node) => node.position.x + (node.width || node.style?.width || 260)));
    const bottom = Math.max(...selected.map((node) => node.position.y + (node.height || node.style?.height || 170)));
    const id = `group-${Date.now()}`;
    const group = {
      id, type: 'group', position: { x: left - 28, y: top - 48 }, data: { title, text: '' },
      style: { width: right - left + 56, height: bottom - top + 76 }, zIndex: 0, selected: true,
    };
    const children = state.nodes.map((node) => selected.includes(node) ? {
      ...node, parentId: id, extent: 'parent', position: { x: node.position.x - left + 28, y: node.position.y - top + 48 }, selected: false, zIndex: 1,
    } : { ...node, selected: false });
    return {
      nodes: [...children.filter((node) => !selected.includes(node)), group, ...children.filter((node) => selected.includes(node))],
      dirty: true,
    };
  }),
  updateNode: (id, patch) => historyUpdate(set, get, (state) => ({
    nodes: state.nodes.map((node) => node.id === id ? { ...node, ...patch } : node), dirty: true,
  })),
  addEdge: (edge) => historyUpdate(set, get, (state) => ({ edges: [...state.edges, edge], dirty: true })),
  updateEdge: (id, patch) => historyUpdate(set, get, (state) => ({
    edges: state.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge), dirty: true,
  })),
  removeEdge: (id) => historyUpdate(set, get, (state) => ({
    edges: state.edges.filter((edge) => edge.id !== id), dirty: true,
  })),
  removeSelected: () => historyUpdate(set, get, (state) => {
    const removed = new Set(state.nodes.filter((node) => node.selected).map((node) => node.id));
    for (const node of state.nodes) if (removed.has(node.parentId)) removed.add(node.id);
    return { nodes: state.nodes.filter((node) => !removed.has(node.id)), edges: state.edges.filter((edge) => !edge.selected && !removed.has(edge.source) && !removed.has(edge.target)), dirty: true };
  }),
  duplicateSelected: () => historyUpdate(set, get, (state) => {
    const copies = state.nodes.filter((node) => node.selected).map((node) => ({ ...clone(node), id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, position: { x: node.position.x + 36, y: node.position.y + 36 }, selected: false }));
    return { nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), ...copies], dirty: true };
  }),
  copySelected: () => set({ clipboard: clone(get().nodes.filter((node) => node.selected)) }),
  paste: () => {
    const copies = get().clipboard;
    if (!copies?.length) return;
    historyUpdate(set, get, (state) => {
      const newNodes = copies.map((node) => ({ ...clone(node), id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, position: { x: node.position.x + 42, y: node.position.y + 42 }, selected: true }));
      return { nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), ...newNodes], dirty: true };
    });
  },
  toggleSetting: (key) => historyUpdate(set, get, (state) => ({ settings: { ...state.settings, [key]: !state.settings[key] }, dirty: true })),
  setSetting: (key, value) => historyUpdate(set, get, (state) => ({ settings: { ...state.settings, [key]: value }, dirty: true })),
  undo: () => {
    lastNodeDataUpdateAt = 0;
    const state = get();
    if (!state.past.length) return;
    const previous = state.past[state.past.length - 1];
    set({ ...previous, past: state.past.slice(0, -1), future: [clone(snapshot(state)), ...state.future], dirty: true });
  },
  redo: () => {
    lastNodeDataUpdateAt = 0;
    const state = get();
    if (!state.future.length) return;
    const [next, ...future] = state.future;
    set({ ...next, past: [...state.past, clone(snapshot(state))].slice(-80), future, dirty: true });
  },
  replaceProject: (project, filePath = null) => {
    lastNodeDataUpdateAt = 0;
    set({
      nodes: project.nodes, edges: project.edges, settings: { ...defaultCanvas, ...project.settings },
      viewport: project.viewport || { x: 0, y: 0, zoom: 1 }, filePath, dirty: false, past: [], future: [],
    });
  },
  newProject: () => {
    lastNodeDataUpdateAt = 0;
    set({ nodes: [], edges: [], settings: { ...defaultCanvas }, viewport: { x: 0, y: 0, zoom: 1 }, filePath: null, dirty: false, past: [], future: [] });
  },
  serialize: () => {
    const { nodes, edges, settings, viewport } = get();
    return JSON.stringify({ format: 'visual-notebook', version: 1, nodes, edges, settings, viewport }, null, 2);
  },
}));
