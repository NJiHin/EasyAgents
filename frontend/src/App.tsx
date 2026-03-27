import { TopBar } from './components/TopBar';
import { Canvas } from './components/Canvas';
import { NodePanel } from './components/NodePanel';
import { LogDrawer } from './components/LogDrawer';
import { RunBar } from './components/RunBar';
import { useGraphStore } from './store/graphStore';

function App() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);

  return (
    <div className="app-shell">
      <TopBar />
      <div className={`app-main${selectedNodeId ? ' panel-open' : ''}`}>
        <Canvas />
        <NodePanel />
      </div>
      <LogDrawer />
      <RunBar />
    </div>
  );
}

export default App;
