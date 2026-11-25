import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  applyEdgeChanges, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  MousePointer2, Hand, SquarePlus, StickyNote, Heading, ListChecks, Waypoints,
  Group, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Grid2X2, Save, FolderOpen,
  Plus, Settings2, X, Copy, Trash2, Check, ChevronLeft, ChevronRight,
  BookOpen, Link2, Orbit, Sparkles, CheckCircle2,
} from 'lucide-react';
import { useNotebook } from './store.js';
import { BlockNode, NoteNode, HeadingNode, ChecklistNode, GroupNode } from './nodes.jsx';
import ColorPicker from './ColorPicker.jsx';
import { themes, tr } from './i18n.js';
import appIcon from '../assets/visual-notebook.svg';

const nodeTypes = { block: BlockNode, note: NoteNode, heading: HeadingNode, checklist: ChecklistNode, group: GroupNode };
const tools = [
  ['select', 'tool.select', MousePointer2], ['pan', 'tool.pan', Hand],
  ['block', 'tool.block', SquarePlus], ['note', 'tool.note', StickyNote],
  ['heading', 'tool.heading', Heading], ['checklist', 'tool.checklist', ListChecks],
  ['connect', 'tool.connect', Waypoints], ['group', 'tool.group', Group],
];
const menuKeys = ['menu.file', 'menu.edit', 'menu.view', 'menu.insert', 'menu.settings'];
const tutorialIcons = [Sparkles, SquarePlus, Link2, Orbit, BookOpen, CheckCircle2];
const tutorialKeys = [
  ['tutorial.welcomeTitle', 'tutorial.welcomeText', null],
  ['tutorial.toolsTitle', 'tutorial.toolsText', 'toolbar'],
  ['tutorial.connectTitle', 'tutorial.connectText', 'connect-tool'],
  ['tutorial.canvasTitle', 'tutorial.canvasText', 'canvas'],
  ['tutorial.saveTitle', 'tutorial.saveText', 'save-button'],
  ['tutorial.finishTitle', 'tutorial.finishText', 'settings-menu'],
];

function validateProject(value, t) {
  const project = JSON.parse(value);
  if (!project || project.format !== 'visual-notebook' || !Array.isArray(project.nodes) || !Array.isArray(project.edges)) {
    throw new Error(t('error.invalidProject'));
  }
  if (project.nodes.length > 50000 || project.edges.length > 100000) throw new Error(t('error.tooLarge'));
  if (project.nodes.some((node) => !node || typeof node.id !== 'string' || !node.position ||
    !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y) || !node.data || typeof node.data !== 'object')) {
    throw new Error(t('error.invalidNodes'));
  }
  if (project.edges.some((edge) => !edge || typeof edge.id !== 'string' || typeof edge.source !== 'string' || typeof edge.target !== 'string')) {
    throw new Error(t('error.invalidEdges'));
  }
  return project;
}

function CanvasApp() {
  const state = useNotebook();
  const flow = useReactFlow();
  const { language, theme } = state;
  const t = useCallback((key) => tr(language, key), [language]);
  const [tool, setTool] = useState('select');
  const [context, setContext] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [settingsDialog, setSettingsDialog] = useState(null);
  const [autoSaveSeconds, setAutoSaveSeconds] = useState(() => Number(localStorage.getItem('visual-notebook-autosave')) || 2);
  const [tutorialStep, setTutorialStep] = useState(() => localStorage.getItem('visual-notebook-tutorial-complete') ? -1 : 0);
  const [tutorialTarget, setTutorialTarget] = useState(null);
  const [notice, setNotice] = useState('');
  const [showProperties, setShowProperties] = useState(true);
  const noticeTimer = useRef(null);
  const { nodes, edges, settings, viewport, dirty, filePath } = state;
  const selectedNode = nodes.find((node) => node.selected);
  const selectedEdge = edges.find((edge) => edge.selected);
  const selectedCount = nodes.filter((node) => node.selected).length;
  const fileName = filePath ? filePath.split(/[\\/]/).pop() : t('app.untitled');
  const notify = useCallback((message) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2600);
  }, []);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    if (tutorialStep < 0) {
      setTutorialTarget(null);
      return undefined;
    }
    const targetKey = tutorialKeys[tutorialStep]?.[2];
    const updateTarget = () => {
      const target = targetKey ? document.querySelector(`[data-tour="${targetKey}"]`) : null;
      if (!target) {
        setTutorialTarget(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTutorialTarget({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    const frame = requestAnimationFrame(updateTarget);
    window.addEventListener('resize', updateTarget);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateTarget);
    };
  }, [tutorialStep, settingsDialog, showProperties]);

  const finishTutorial = useCallback(() => {
    localStorage.setItem('visual-notebook-tutorial-complete', 'true');
    setTutorialStep(-1);
  }, []);
  const getProjectData = useCallback(() => state.serialize(), [state.serialize]);
  const save = useCallback(async (saveAs = false) => {
    try {
      const result = saveAs || !state.filePath
        ? await window.notebook.saveProjectAs(getProjectData())
        : await window.notebook.saveProject(getProjectData());
      if (result) {
        state.setFilePath(result.filePath);
        state.setDirty(false);
        notify(t('app.saved'));
      }
    } catch (error) {
      notify(`${t('error.save')}: ${error.message}`);
    }
  }, [getProjectData, notify, state, t]);

  const openProject = useCallback(async () => {
    if (state.dirty && !window.confirm(t('notice.unsavedOpen'))) return;
    try {
      const result = await window.notebook.openProject();
      if (result) {
        state.replaceProject(validateProject(result.content, t), result.filePath);
        notify(t('app.opened'));
      }
    } catch (error) {
      notify(`${t('error.open')}: ${error.message}`);
    }
  }, [notify, state, t]);

  const exportProject = useCallback(async (kind) => {
    try {
      const viewportElement = document.querySelector('.react-flow__viewport');
      if (!viewportElement) throw new Error(t('error.canvas'));
      const currentViewport = flow.getViewport();
      let image;
      try {
        await flow.fitView({ padding: 0.14, duration: 0 });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        image = await toPng(viewportElement, { backgroundColor: '#111214', pixelRatio: 2, cacheBust: true });
      } finally {
        flow.setViewport(currentViewport, { duration: 0 });
      }
      if (kind === 'png') {
        const path = await window.notebook.exportImage(image, 'png');
        if (path) notify(t('app.savedPng'));
        return;
      }
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1600, 1000] });
      const dimensions = pdf.getImageProperties(image);
      const ratio = Math.min(1520 / dimensions.width, 920 / dimensions.height);
      const width = dimensions.width * ratio;
      const height = dimensions.height * ratio;
      pdf.addImage(image, 'PNG', (1600 - width) / 2, (1000 - height) / 2, width, height);
      const path = await window.notebook.exportImage(pdf.output('datauristring'), 'pdf');
      if (path) notify(t('app.savedPdf'));
    } catch (error) {
      notify(`${t('error.export')}: ${error.message}`);
    }
  }, [flow, notify, t]);

  const addItem = useCallback((type, position) => {
    const center = flow.screenToFlowPosition({ x: window.innerWidth * 0.48, y: window.innerHeight * 0.48 });
    const target = position || { x: center.x + nodes.length * 22, y: center.y + nodes.length * 18 };
    const nodePosition = settings.snapToGrid
      ? { x: Math.round(target.x / settings.gridSize) * settings.gridSize, y: Math.round(target.y / settings.gridSize) * settings.gridSize }
      : target;
    state.addNode(type, nodePosition);
    setTool('select');
  }, [flow, nodes.length, settings.gridSize, settings.snapToGrid, state]);

  const action = useCallback((name) => {
    setActiveMenu(null);
    switch (name) {
      case 'new':
        if (state.dirty && !window.confirm(t('notice.unsavedNew'))) return;
        state.newProject();
        window.notebook.autosave(useNotebook.getState().serialize()).catch((error) => notify(`${t('error.autosave')}: ${error.message}`));
        break;
      case 'open': openProject(); break;
      case 'save': save(false); break;
      case 'saveAs': save(true); break;
      case 'exportPng': exportProject('png'); break;
      case 'exportPdf': exportProject('pdf'); break;
      case 'closeProject':
        if (!state.dirty || window.confirm(t('notice.confirmClose'))) state.newProject();
        break;
      case 'undo': state.undo(); break;
      case 'redo': state.redo(); break;
      case 'copy': state.copySelected(); break;
      case 'cut': state.copySelected(); state.removeSelected(); break;
      case 'paste': state.paste(); break;
      case 'duplicate': state.duplicateSelected(); break;
      case 'delete': state.removeSelected(); break;
      case 'selectAll': state.setNodes(nodes.map((node) => ({ ...node, selected: true }))); break;
      case 'zoomIn': flow.zoomIn(); break;
      case 'zoomOut': flow.zoomOut(); break;
      case 'zoomReset': flow.zoomTo(1); break;
      case 'fitView': flow.fitView({ padding: 0.18, duration: 250 }); break;
      case 'toggleGrid': state.toggleSetting('showGrid'); break;
      case 'fullscreen': window.notebook.windowAction('fullscreen'); break;
      case 'addBlock': addItem('block'); break;
      case 'addNote': addItem('note'); break;
      case 'addHeading': addItem('heading'); break;
      case 'addChecklist': addItem('checklist'); break;
      case 'addGroup': addItem('group'); break;
      case 'theme': setSettingsDialog('theme'); break;
      case 'canvasSettings': setSettingsDialog('canvas'); break;
      case 'autosaveSettings': setSettingsDialog('autosave'); break;
      case 'languageSettings': setSettingsDialog('general'); break;
      default: break;
    }
  }, [addItem, exportProject, flow, nodes, notify, openProject, save, state, t]);

  useEffect(() => window.notebook.onMenu(action), [action]);
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const restored = await window.notebook.restore();
        if (restored?.content) {
          if (useNotebook.getState().dirty) return;
          const project = validateProject(restored.content, tRef.current);
          if (project.nodes.length || project.edges.length) {
            state.replaceProject(project, null);
            notify(tRef.current('notice.recovered'));
          }
        }
      } catch (error) {
        notify(`${tRef.current('error.recover')}: ${error.message}`);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [notify]);
  useEffect(() => {
    if (!dirty) return undefined;
    const timer = setTimeout(() => {
      window.notebook.autosave(getProjectData()).catch((error) => notify(`${t('error.autosave')}: ${error.message}`));
    }, autoSaveSeconds * 1000);
    return () => clearTimeout(timer);
  }, [dirty, nodes, edges, settings, viewport, getProjectData, notify, autoSaveSeconds, t]);

  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      const editing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(event.shiftKey); return; }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); action('fitView'); return; }
      if (event.key === 'F11') { event.preventDefault(); action('fullscreen'); return; }
      if ((event.ctrlKey || event.metaKey) && ['n', 'o'].includes(event.key.toLowerCase())) {
        event.preventDefault(); action(event.key.toLowerCase() === 'n' ? 'new' : 'open'); return;
      }
      if (editing) {
        if (event.key === 'Escape') target.blur();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); state.undo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); state.redo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); action('selectAll'); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); state.copySelected(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); state.paste(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); state.duplicateSelected(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); state.removeSelected(); }
      else if (event.key === 'Escape') {
        if (tutorialStep >= 0) finishTutorial();
        else { setContext(null); setTool('select'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [action, finishTutorial, save, state, tutorialStep]);

  useEffect(() => {
    const persistRecovery = () => window.notebook.autosaveSync(getProjectData());
    window.addEventListener('beforeunload', persistRecovery);
    return () => window.removeEventListener('beforeunload', persistRecovery);
  }, [getProjectData]);

  const onNodesChange = useCallback((changes) => {
    state.setNodes(applyNodeChanges(changes, useNotebook.getState().nodes));
    if (changes.some((change) => ['position', 'dimensions', 'remove'].includes(change.type))) state.setDirty();
  }, [state]);
  const onEdgesChange = useCallback((changes) => {
    state.setEdges(applyEdgeChanges(changes, useNotebook.getState().edges));
    if (changes.some((change) => change.type === 'remove')) state.setDirty();
  }, [state]);
  const onConnect = useCallback((connection) => state.addEdge({
    ...connection, id: `edge-${Date.now()}`, type: 'default', pathOptions: { curvature: 0.42 }, label: '',
    markerEnd: { type: 'arrowclosed', color: 'var(--accent)' }, style: { stroke: 'var(--edge-color)', strokeWidth: 2 },
  }), [state]);

  const handleCanvasClick = (event) => {
    setContext(null);
    if (['block', 'note', 'heading', 'checklist', 'group'].includes(tool)) {
      addItem(tool, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    }
  };
  const handleContextMenu = (event, node) => {
    event.stopPropagation();
    event.preventDefault();
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setContext({ x: event.clientX, y: event.clientY, flowPoint: point, onNode: !!node, nodeId: node?.id });
  };

  const menuAction = (name) => { action(name); };
  const nodeEdgeStyle = useMemo(() => ({ background: 'var(--canvas)' }), []);
  const localizedMenus = useMemo(() => getMenuItems(t), [t]);
  const tutorialContent = tutorialKeys[tutorialStep];
  const TutorialIcon = tutorialIcons[tutorialStep];

  return <div className="app-shell" data-theme={theme} onClick={() => activeMenu && setActiveMenu(null)}>
    <header className="topbar">
      <img className="brand-icon" src={appIcon} alt="" /><div className="brand-name">Visual Notebook</div>
      <nav className="app-menu" onClick={(event) => event.stopPropagation()}>
        {menuKeys.map((key, index) => <div className="menu-wrap" key={key} data-tour={index === 4 ? 'settings-menu' : undefined}>
          <button className={`menu-trigger ${activeMenu === index ? 'active' : ''}`} onClick={() => setActiveMenu(activeMenu === index ? null : index)}>{t(key)}</button>
          {activeMenu === index && <div className="dropdown-menu">{(localizedMenus[index] || []).map(([label, act, shortcut]) =>
            <button key={act} onClick={() => menuAction(act)}><span>{label}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>)}</div>}
        </div>)}
      </nav>
      <div className="document-title">{fileName}{dirty ? ' ·' : ''}</div>
      <div className="window-actions">
        <button aria-label={t('window.minimize')} onClick={() => window.notebook.windowAction('minimize')}>−</button>
        <button aria-label={t('window.maximize')} onClick={() => window.notebook.windowAction('maximize')}>□</button>
        <button className="close-window" aria-label={t('window.close')} onClick={() => window.notebook.windowAction('close')}><X size={15} /></button>
      </div>
    </header>
    <div className="toolbar">
      <div className="tool-group" data-tour="toolbar">{tools.map(([id, titleKey, Icon]) => <button key={id} title={t(titleKey)} aria-label={t(titleKey)} data-tour={id === 'connect' ? 'connect-tool' : undefined} className={`tool-button ${tool === id ? 'selected' : ''}`} onClick={() => {
        if (id === 'group' && selectedCount >= 2) { state.groupSelected(t('node.group')); setTool('select'); }
        else setTool(id);
      }}>
        <Icon size={17} />{id === 'select' && <span className="tool-label">{t(titleKey)}</span>}
      </button>)}</div>
      <div className="toolbar-separator" />
      <button className="tool-button" title={`${t('action.undo')} (Ctrl+Z)`} onClick={() => state.undo()}><Undo2 size={17} /></button>
      <button className="tool-button" title={`${t('action.redo')} (Ctrl+Y)`} onClick={() => state.redo()}><Redo2 size={17} /></button>
      <div className="toolbar-spacer" />
      <button className="tool-button" title={t('action.open')} onClick={openProject}><FolderOpen size={17} /></button>
      <button className="tool-button" title={`${t('action.save')} (Ctrl+S)`} onClick={() => save(false)}><Save size={17} /></button>
      <button className="primary-button" data-tour="save-button" onClick={() => save(true)}><Plus size={15} /> {t('app.saveAs')}</button>
    </div>
    <main className="workspace">
      <section className={`canvas-wrap ${tool === 'pan' ? 'pan-mode' : ''} ${tool === 'connect' ? 'connect-mode' : ''}`} onContextMenu={(event) => handleContextMenu(event)} data-tour="canvas">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onNodeDragStart={() => state.recordHistory()} onNodeDragStop={() => state.setDirty()}
          onConnectStart={() => setTool('connect')} onConnectEnd={() => setTool((current) => current === 'connect' ? 'select' : current)}
          onMoveEnd={(_event, nextViewport) => state.setViewport(nextViewport)}
          onPaneClick={handleCanvasClick} onNodeContextMenu={handleContextMenu}
          onEdgeClick={(_event, edge) => { state.setNodes(nodes.map((node) => ({ ...node, selected: false }))); state.setEdges(edges.map((entry) => ({ ...entry, selected: entry.id === edge.id }))); }}
          connectionMode="loose" nodesConnectable={tool === 'connect'} fitView={nodes.length > 0 && !filePath && !dirty} fitViewOptions={{ padding: 0.2 }}
          panOnDrag={tool === 'pan' ? true : [1]} selectionOnDrag={tool === 'select'} selectionMode="partial"
          panOnScroll={false} zoomOnScroll zoomOnPinch zoomOnDoubleClick={false} deleteKeyCode={null}
          snapToGrid={settings.snapToGrid} snapGrid={[settings.gridSize, settings.gridSize]}
          defaultEdgeOptions={{ type: 'default', pathOptions: { curvature: 0.42 }, markerEnd: { type: 'arrowclosed' }, style: { stroke: 'var(--edge-color)', strokeWidth: 2 } }}
          style={nodeEdgeStyle} defaultViewport={viewport} minZoom={0.08} maxZoom={2.5}
        >
          {settings.showGrid && <Background variant={BackgroundVariant.Dots} gap={settings.gridSize} size={1} color="#30343b" />}
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.type === 'note' ? '#9a7b42' : node.type === 'heading' ? '#647ba0' : '#59616d'} maskColor="rgba(14,15,17,.75)" />
        </ReactFlow>
        {nodes.length === 0 && <div className="empty-hint"><div className="hint-icon"><Waypoints size={24} /></div><strong>{t('canvas.emptyTitle')}</strong><span>{t('canvas.emptyHint')}</span><button onClick={() => addItem('block')}>{t('canvas.addFirst')}</button></div>}
        <div className="canvas-status"><span><span className="status-dot" />{t('app.local')}</span><span>{nodes.length} {t('app.nodes')} · {edges.length} {t('app.edges')}</span></div>
      </section>
      {showProperties && <aside className="properties-panel">
        <div className="panel-heading"><div><strong>{selectedEdge ? t('panel.edge') : selectedNode ? t('panel.properties') : t('panel.canvas')}</strong><span>{selectedNode ? `${selectedCount > 1 ? `${selectedCount} ${t('panel.selected')}` : t(`type.${selectedNode.type}`)}` : selectedEdge ? t('panel.edge') : t('panel.canvasSettings')}</span></div><button className="icon-button" aria-label={t('window.close')} onClick={() => setShowProperties(false)}><X size={15} /></button></div>
        {selectedNode && selectedCount === 1 && <div className="property-content">
          <label>{t('panel.title')}</label><input value={selectedNode.data.title || ''} onChange={(event) => state.updateNodeData(selectedNode.id, { title: event.target.value })} />
          {selectedNode.type !== 'heading' && selectedNode.type !== 'checklist' && <><label>{t('panel.text')}</label><textarea rows={5} value={selectedNode.data.text || ''} onChange={(event) => state.updateNodeData(selectedNode.id, { text: event.target.value })} /></>}
          {selectedNode.type === 'block' && <><label>{t('panel.blockColor')}</label><ColorPicker value={selectedNode.data.color} onChange={(color) => state.updateNodeData(selectedNode.id, { color })} language={language} /></>}
          <label>{t('panel.size')}</label><div className="dimensions"><input type="number" aria-label={t('panel.size')} value={Math.round(selectedNode.width || selectedNode.style?.width || 260)} onChange={(event) => state.updateNode(selectedNode.id, { style: { ...selectedNode.style, width: Number(event.target.value) } })} /><span>×</span><input type="number" aria-label={t('panel.size')} value={Math.round(selectedNode.height || selectedNode.style?.height || 170)} onChange={(event) => state.updateNode(selectedNode.id, { style: { ...selectedNode.style, height: Number(event.target.value) } })} /></div>
          <div className="property-actions"><button onClick={() => state.duplicateSelected()}><Copy size={14} /> {t('action.duplicate')}</button><button className="danger-action" onClick={() => state.removeSelected()}><Trash2 size={14} /> {t('action.delete')}</button></div>
        </div>}
        {selectedEdge && <div className="property-content">
          <label>{t('panel.edgeLabel')}</label><input value={selectedEdge.label || ''} onChange={(event) => state.updateEdge(selectedEdge.id, { label: event.target.value })} />
          <label>{t('panel.edgeType')}</label><select value={selectedEdge.type || 'default'} onChange={(event) => state.updateEdge(selectedEdge.id, { type: event.target.value, ...(event.target.value === 'default' ? { pathOptions: { ...selectedEdge.pathOptions, curvature: selectedEdge.pathOptions?.curvature || 0.42 } } : {}) })}><option value="default">{t('panel.bezier')}</option><option value="smoothstep">{t('panel.smooth')}</option><option value="straight">{t('panel.straight')}</option></select>
          {selectedEdge.type === 'default' && <label className="range-setting"><span>{t('panel.curvature')}</span><strong>{Math.round((selectedEdge.pathOptions?.curvature || 0.42) * 100)}%</strong><input type="range" min="0.1" max="0.8" step="0.01" value={selectedEdge.pathOptions?.curvature || 0.42} onChange={(event) => state.updateEdge(selectedEdge.id, { pathOptions: { ...selectedEdge.pathOptions, curvature: Number(event.target.value) } })} /></label>}
          <label className="check-setting"><input type="checkbox" checked={!!selectedEdge.markerEnd} onChange={(event) => state.updateEdge(selectedEdge.id, { markerEnd: event.target.checked ? { type: 'arrowclosed', color: 'var(--accent)' } : undefined })} /> {t('panel.arrow')}</label>
          <button className="delete-edge" onClick={() => state.removeEdge(selectedEdge.id)}><Trash2 size={14} /> {t('panel.removeEdge')}</button>
        </div>}
        {!selectedNode && !selectedEdge && <div className="property-content canvas-settings">
          <label className="check-setting"><input type="checkbox" checked={settings.showGrid} onChange={() => state.toggleSetting('showGrid')} /> {t('panel.showGrid')}</label>
          <label className="check-setting"><input type="checkbox" checked={settings.snapToGrid} onChange={() => state.toggleSetting('snapToGrid')} /> {t('panel.snap')}</label>
          <label>{t('panel.gridSize')}</label><select value={settings.gridSize} onChange={(event) => state.setSetting('gridSize', Number(event.target.value))}><option value="12">{t('panel.compact')}</option><option value="20">{t('panel.standard')}</option><option value="32">{t('panel.large')}</option></select>
          <div className="canvas-summary"><span>{t('panel.elements')}</span><b>{nodes.length}</b><span>{t('panel.connections')}</span><b>{edges.length}</b></div>
          <button className="fit-button" onClick={() => flow.fitView({ padding: 0.18, duration: 250 })}><Maximize size={14} /> {t('panel.fit')}</button>
        </div>}
      </aside>}
    </main>
    <footer className="bottom-bar">
      <div className="zoom-readout"><button onClick={() => flow.zoomOut()} aria-label={t('action.zoomOut')}><ZoomOut size={14} /></button><span>{Math.round((viewport?.zoom || 1) * 100)}%</span><button onClick={() => flow.zoomIn()} aria-label={t('action.zoomIn')}><ZoomIn size={14} /></button><i /><button onClick={() => flow.fitView({ padding: 0.18, duration: 250 })} title={t('action.fitView')}><Maximize size={14} /></button></div>
      <div className="bottom-tools"><button onClick={() => state.toggleSetting('showGrid')} className={settings.showGrid ? 'active' : ''} title={t('panel.showGrid')}><Grid2X2 size={14} /></button><span>{tool === 'connect' ? t('canvas.hintConnect') : tool === 'pan' ? t('canvas.hintPan') : t('canvas.hintDefault')}</span></div>
      {!showProperties && <button className="show-props" onClick={() => setShowProperties(true)}><Settings2 size={14} /> {t('panel.properties')}</button>}
    </footer>
    {context && <div className="context-overlay" onMouseDown={() => setContext(null)}><div className="context-menu" style={{ left: Math.min(context.x, window.innerWidth - 205), top: Math.min(context.y, window.innerHeight - 300) }} onMouseDown={(event) => event.stopPropagation()}>
      {!context.onNode && <><button onClick={() => { addItem('block', context.flowPoint); setContext(null); }}><SquarePlus size={15} /> {t('context.createBlock')}</button>
        <button onClick={() => { addItem('note', context.flowPoint); setContext(null); }}><StickyNote size={15} /> {t('context.createNote')}</button>
        <button onClick={() => { addItem('heading', context.flowPoint); setContext(null); }}><Heading size={15} /> {t('context.createHeading')}</button>
        <button onClick={() => { addItem('checklist', context.flowPoint); setContext(null); }}><ListChecks size={15} /> {t('context.createChecklist')}</button>
        <button onClick={() => { addItem('group', context.flowPoint); setContext(null); }}><Group size={15} /> {t('context.createGroup')}</button>
        <div className="context-divider" /><button onClick={() => { state.paste(); setContext(null); }}><Copy size={15} /> {t('action.paste')}</button>
      </>}
      {context.onNode && <><button onClick={() => { state.setNodes(nodes.map((node) => ({ ...node, selected: node.id === context.nodeId }))); state.duplicateSelected(); setContext(null); }}><Copy size={15} /> {t('action.duplicate')}</button>
        <button onClick={() => { state.setNodes(nodes.map((node) => ({ ...node, selected: node.id === context.nodeId }))); state.removeSelected(); setContext(null); }}><Trash2 size={15} /> {t('action.delete')}</button>
        <div className="context-color-picker"><ColorPicker value={nodes.find((node) => node.id === context.nodeId)?.data.color} onChange={(color) => state.updateNodeData(context.nodeId, { color })} language={language} showLabel /></div>
      </>}
    </div></div>}
    {settingsDialog && <div className="settings-backdrop" onMouseDown={() => setSettingsDialog(null)}><section className={`settings-dialog ${settingsDialog === 'theme' ? 'theme-dialog' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><strong>{t(settingsDialog === 'canvas' ? 'action.canvasSettings' : settingsDialog === 'autosave' ? 'action.autosaveSettings' : settingsDialog === 'theme' ? 'theme.title' : 'action.languageSettings')}</strong><span>{t('settings.subtitle')}</span></div><button className="icon-button" onClick={() => setSettingsDialog(null)} aria-label={t('window.close')}><X size={15} /></button></header>
      {settingsDialog === 'canvas' && <div className="settings-body">
        <label className="check-setting"><input type="checkbox" checked={settings.showGrid} onChange={() => state.toggleSetting('showGrid')} /> {t('panel.showGrid')}</label>
        <label className="check-setting"><input type="checkbox" checked={settings.snapToGrid} onChange={() => state.toggleSetting('snapToGrid')} /> {t('panel.snap')}</label>
        <label>{t('panel.gridSize')}</label><select value={settings.gridSize} onChange={(event) => state.setSetting('gridSize', Number(event.target.value))}><option value="12">{t('panel.compact')}</option><option value="20">{t('panel.standard')}</option><option value="32">{t('panel.large')}</option></select>
      </div>}
      {settingsDialog === 'autosave' && <div className="settings-body">
        <label>{t('settings.autoSave')}</label><select value={autoSaveSeconds} onChange={(event) => {
          const value = Number(event.target.value);
          setAutoSaveSeconds(value);
          localStorage.setItem('visual-notebook-autosave', String(value));
        }}><option value="1">{t('settings.everySecond')}</option><option value="2">{t('settings.every2')}</option><option value="5">{t('settings.every5')}</option><option value="10">{t('settings.every10')}</option></select>
        <p>{t('settings.recovery')}</p>
      </div>}
      {settingsDialog === 'general' && <div className="settings-body">
        <label>{t('settings.language')}</label><select value={language} onChange={(event) => state.setLanguage(event.target.value)}><option value="ru">{t('language.ru')}</option><option value="en">{t('language.en')}</option><option value="uk">{t('language.uk')}</option></select>
      </div>}
      {settingsDialog === 'theme' && <div className="theme-grid">{themes.map((item) => <button key={item.id} className={`theme-card ${theme === item.id ? 'chosen' : ''}`} onClick={() => state.setTheme(item.id)}>
        <span className="theme-preview" style={{ '--swatch-bg': item.swatches[0], '--swatch-surface': item.swatches[1], '--swatch-accent': item.swatches[2] }}><i /><i /><i /></span>
        <span className="theme-name">{t(item.key)}</span>{theme === item.id && <CheckCircle2 className="theme-check" size={15} />}
      </button>)}</div>}
      {settingsDialog === 'theme' && <p className="theme-description">{t('theme.description')}</p>}
      <footer><button onClick={() => setSettingsDialog(null)}>{t('panel.done')}</button></footer>
    </section></div>}
    {tutorialStep >= 0 && <div className={`tutorial-overlay ${tutorialTarget ? 'has-spotlight' : ''}`}>
      {tutorialTarget
        ? <div className="tutorial-spotlight" style={{ left: tutorialTarget.left - 7, top: tutorialTarget.top - 7, width: tutorialTarget.width + 14, height: tutorialTarget.height + 14 }} />
        : <div className="tutorial-dim" />}
      <section className="tutorial-card">
        <div className="tutorial-topline"><span><span className="tutorial-live-dot" /> Visual Notebook</span><button onClick={finishTutorial}>{t('tutorial.skip')} <X size={14} /></button></div>
        <div className="tutorial-progress">{tutorialKeys.map((_, index) => <i key={index} className={index <= tutorialStep ? 'filled' : ''} />)}</div>
        <div className="tutorial-icon"><TutorialIcon size={22} /></div>
        <div className="tutorial-step-label">{t('tutorial.step')} {tutorialStep + 1} {t('tutorial.of')} {tutorialKeys.length}</div>
        <h2>{t(tutorialContent[0])}</h2><p>{t(tutorialContent[1])}</p>
        <div className="tutorial-actions">{tutorialStep > 0 && <button className="tutorial-back" onClick={() => setTutorialStep((step) => step - 1)}><ChevronLeft size={16} /> {t('tutorial.back')}</button>}
          <button className="tutorial-next" onClick={() => tutorialStep === tutorialKeys.length - 1 ? finishTutorial() : setTutorialStep((step) => step + 1)}>
            {tutorialStep === tutorialKeys.length - 1 ? t('tutorial.start') : t('tutorial.next')} {tutorialStep === tutorialKeys.length - 1 ? <Check size={15} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </section>
    </div>}
    {notice && <div className="toast"><Check size={15} />{notice}</div>}
  </div>;
}

function getMenuItems(t) {
  const entry = (key, action, shortcut) => [t(key), action, shortcut];
  return [
    [entry('action.new', 'new', 'Ctrl+N'), entry('action.open', 'open', 'Ctrl+O'), entry('action.save', 'save', 'Ctrl+S'), entry('action.saveAs', 'saveAs', 'Ctrl+Shift+S'), entry('action.exportPng', 'exportPng'), entry('action.exportPdf', 'exportPdf'), entry('action.closeProject', 'closeProject')],
    [entry('action.undo', 'undo', 'Ctrl+Z'), entry('action.redo', 'redo', 'Ctrl+Y'), entry('action.cut', 'cut', 'Ctrl+X'), entry('action.copy', 'copy', 'Ctrl+C'), entry('action.paste', 'paste', 'Ctrl+V'), entry('action.duplicate', 'duplicate', 'Ctrl+D'), entry('action.selectAll', 'selectAll', 'Ctrl+A'), entry('action.delete', 'delete', 'Delete')],
    [entry('action.zoomIn', 'zoomIn'), entry('action.zoomOut', 'zoomOut'), entry('action.zoomReset', 'zoomReset'), entry('action.fitView', 'fitView'), entry('action.toggleGrid', 'toggleGrid'), entry('action.fullscreen', 'fullscreen', 'F11')],
    [entry('action.addBlock', 'addBlock'), entry('action.addNote', 'addNote'), entry('action.addHeading', 'addHeading'), entry('action.addChecklist', 'addChecklist'), entry('action.addGroup', 'addGroup')],
    [entry('action.theme', 'theme'), entry('action.canvasSettings', 'canvasSettings'), entry('action.autosaveSettings', 'autosaveSettings'), entry('action.languageSettings', 'languageSettings')],
  ];
}

export default function App() {
  return <ReactFlowProvider><CanvasApp /></ReactFlowProvider>;
}
