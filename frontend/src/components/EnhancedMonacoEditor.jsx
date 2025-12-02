import React, { useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';

const EngineIndicator = ({ engine }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ fontSize: '12px', color: '#888' }}>Engine:</span>
    <span style={{ 
      padding: '4px 8px',
      backgroundColor: '#007ACC',
      color: '#fff',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 'bold'
    }}>
      {engine.toUpperCase()}
    </span>
  </div>
);

const ExecutionButtons = ({ onExecute, isExecuting }) => (
  <div style={{ display: 'flex', gap: '8px' }}>
    <button
      onClick={onExecute}
      disabled={isExecuting}
      style={{
        padding: '6px 16px',
        backgroundColor: '#28a745',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: isExecuting ? 'not-allowed' : 'pointer',
        opacity: isExecuting ? 0.6 : 1,
        fontSize: '12px'
      }}
    >
      {isExecuting ? 'Executing...' : 'Execute (Ctrl+Enter)'}
    </button>
  </div>
);

export const EnhancedMonacoEditor = ({ 
  engine = 'python',
  code = '',
  onCodeChange = () => {},
  onExecute = () => {},
  isExecuting = false
}) => {
  const editorRef = useRef(null);

  const engineConfigs = {
    spark: {
      language: 'scala',
      theme: 'vs-dark',
    },
    flink: {
      language: 'java',
      theme: 'vs-dark',
    },
    python: {
      language: 'python',
      theme: 'vs-dark',
    },
    sql: {
      language: 'sql',
      theme: 'vs-dark',
    }
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    
    // 添加快捷键：Ctrl+Enter执行代码
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onExecute(editor.getValue())
    );
  };

  const config = engineConfigs[engine] || engineConfigs.python;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px',
        backgroundColor: '#2d2d2d',
        borderBottom: '1px solid #444'
      }}>
        <EngineIndicator engine={engine} />
        <ExecutionButtons 
          onExecute={() => onExecute(code)}
          isExecuting={isExecuting}
        />
      </div>
      
      <MonacoEditor
        height="100%"
        language={config.language}
        value={code}
        onChange={onCodeChange}
        theme={config.theme}
        onMount={handleEditorDidMount}
        options={{
          fontSize: 14,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          quickSuggestions: true,
          formatOnType: true,
          tabSize: 4
        }}
      />
    </div>
  );
};
