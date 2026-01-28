import React, { useRef, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Search, Sparkles, Save, Play, Loader2 } from 'lucide-react';

export const EnhancedMonacoEditor = ({ 
  language = 'python',
  kernelType = null,
  code = '',
  onCodeChange = () => {},
  onExecute = () => {},
  onSave = null,
  onSaveAs = null,
  isExecuting = false,
  filePath = null,
  isModified = false,
  theme = 'vs-dark'
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

    // 添加快捷键：Ctrl+F 搜索（使用内置搜索面板）
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF,
      () => {
        editor.getAction('actions.find')?.run();
      }
    );

    // 添加快捷键：Ctrl+H 搜索替换（使用内置搜索面板）
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH,
      () => {
        editor.getAction('editor.action.startFindReplaceAction')?.run();
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
    <div className="flex flex-col h-full bg-background relative">
      <div className="flex justify-between items-center px-4 py-2 bg-card border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Language:</span>
            <Badge>{language.toUpperCase()}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Kernel:</span>
            <Badge variant={kernelType ? "default" : "secondary"}>
              {kernelType ? kernelType.toUpperCase() : 'NONE'}
            </Badge>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (editorRef.current) {
                    editorRef.current.getAction('editor.action.startFindReplaceAction')?.run();
                  }
                }}
              >
                <Search className="h-4 w-4 mr-1" />
                搜索
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>搜索和替换 (Ctrl+F / Ctrl+H)</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFormat}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                格式化
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>格式化代码 (Shift+Alt+F)</p>
            </TooltipContent>
          </Tooltip>
          {onSaveAs && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSaveAs(code)}
                >
                  <Save className="h-4 w-4 mr-1" />
                  保存文件
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>保存文件 (可自定义文件名)</p>
              </TooltipContent>
            </Tooltip>
          )}
          {onSave && filePath && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isModified ? "default" : "secondary"}
                  size="sm"
                  onClick={() => onSave(filePath, code)}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isModified ? '保存' : '已保存'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>保存 (Ctrl+S)</p>
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={() => onExecute(code)}
                disabled={isExecuting}
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    执行中...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    执行
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>执行代码 (Ctrl+Enter)</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language={config.language}
          value={code}
          onChange={onCodeChange}
          theme={theme}
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
