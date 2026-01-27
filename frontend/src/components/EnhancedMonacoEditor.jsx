import React, { useRef, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';

export const EnhancedMonacoEditor = ({ 
  language = 'python',
  kernelType = null,
  code = '',
  onCodeChange = () => {},
  onExecute = () => {},
  onSave = null,
  isExecuting = false,
  filePath = null,
  isModified = false
}) => {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  const languageConfigs = {
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
    monacoRef.current = monaco;
    
    // 添加快捷键：Ctrl+Enter执行代码
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onExecute(editor.getValue())
    );

    // 添加快捷键：Ctrl+S保存
    if (onSave) {
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          if (filePath) {
            onSave(filePath, editor.getValue());
          }
        }
      );
    }

    // 添加快捷键：Shift+Alt+F格式化
    editor.addCommand(
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      () => {
        editor.getAction('editor.action.formatDocument')?.run();
      }
    );
  };

  // 格式化代码
  const handleFormat = async () => {
    if (editorRef.current && monacoRef.current) {
      try {
        await editorRef.current.getAction('editor.action.formatDocument')?.run();
      } catch (error) {
        console.error('Format error:', error);
      }
    }
  };

  const config = languageConfigs[language] || languageConfigs.python;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex justify-between items-center px-4 py-2 bg-card border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Language:</span>
            <span className="px-2 py-0.5 bg-primary text-primary-foreground rounded text-xs font-semibold">
              {language.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Kernel:</span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              kernelType ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'
            }`}>
              {kernelType ? kernelType.toUpperCase() : 'NONE'}
            </span>
          </div>
          {filePath && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">文件:</span>
              <span className="text-xs text-foreground font-mono">{filePath}</span>
              {isModified && (
                <span className="text-xs text-orange-500">●</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFormat}
            className="btn-ghost text-xs px-3 py-1"
            title="格式化代码 (Shift+Alt+F)"
          >
            🎨 格式化
          </button>
          {onSave && filePath && (
            <button
              onClick={() => onSave(filePath, code)}
              className={`text-xs px-3 py-1 ${
                isModified 
                  ? 'btn-primary' 
                  : 'btn-secondary opacity-60'
              }`}
              title="保存 (Ctrl+S)"
            >
              💾 {isModified ? '保存' : '已保存'}
            </button>
          )}
          <button
            onClick={() => onExecute(code)}
            disabled={isExecuting}
            className="btn-primary text-xs px-3 py-1"
            title="执行代码 (Ctrl+Enter)"
          >
            {isExecuting ? '⏳ 执行中...' : '▶️ 执行'}
          </button>
        </div>
      </div>
      
      <div className="flex-1 min-h-0">
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
            formatOnPaste: true,
            tabSize: 4,
            insertSpaces: true,
            detectIndentation: false,
          }}
        />
      </div>
    </div>
  );
};
