import { useState, useEffect } from 'react';
import type { ToolDefinition } from '../types';

interface ToolsResponse {
  tools: ToolDefinition[];
  evaluatorTools: ToolDefinition[];
}

export function useTools(): ToolsResponse {
  const [toolsResponse, setToolsResponse] = useState<ToolsResponse>({
    tools: [],
    evaluatorTools: [],
  });

  useEffect(() => {
    fetch('/api/tools')
      .then(r => {
        if (!r.ok) throw new Error(`/api/tools returned ${r.status}`);
        return r.json();
      })
      .then(setToolsResponse)
      .catch(console.error);
  }, []);

  return toolsResponse;
}
