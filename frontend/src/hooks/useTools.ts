import { useState, useEffect } from 'react';
import type { ToolDefinition } from '../types';

export function useTools() {
  const [tools, setTools] = useState<ToolDefinition[]>([]);

  useEffect(() => {
    fetch('/api/tools')
      .then(r => r.json())
      .then(setTools)
      .catch(console.error);
  }, []);

  return tools;
}
