import React, { useState, useCallback, useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import axios from 'axios';
import { EnhancedMonacoEditor } from './EnhancedMonacoEditor';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { X, Plus, Folder, FolderOpen, ChevronRight, Loader2 } from 'lucide-react';

const API_BASE_URL = '/api';

const TabbedEditor = forwardRef(({ 
  pendingFileOpen,
  onFileOpened,
  onExecute, 
  isExecuting, 
  kernelType, 
  language,
  theme = 'vs-dark',
  wsRef,
  messageQueueRef,
  sessionId,
  setSessionId,
  setKernelId,
  setWsConnected,
  wsConnected,
  createSession
}, ref) => {
  const [tabs, setTabs] = useState(() => {
    // 默认新建标签页不再填充示例代码，保持空白，避免干扰用户输入
    const defaultContent = '';
    return [
      { id: 'new-1', name: 'Untitled-1', content: defaultContent, path: null, modified: false, language: language || 'python' }
    ];
  });
  const [activeTabId, setActiveTabId] = useState('new-1');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const autoSaveTimerRef = useRef(null);
  // 另存为对话框：选择文件夹 + 文件名
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [saveAsTabId, setSaveAsTabId] = useState(null);
  const [saveAsCurrentPath, setSaveAsCurrentPath] = useState('');
  const [saveAsFileList, setSaveAsFileList] = useState([]);
  const [saveAsFileName, setSaveAsFileName] = useState('');
  const [saveAsLoading, setSaveAsLoading] = useState(false);
  const [saveAsSubmitting, setSaveAsSubmitting] = useState(false);
  const [saveAsError, setSaveAsError] = useState('');

  // 获取当前活动标签页
  const activeTab = useMemo(() => {
    return tabs.find(t => t.id === activeTabId) || tabs[0];
  }, [tabs, activeTabId]);

  // 自动保存
  useEffect(() => {
    if (!autoSaveEnabled || !activeTab.path || !activeTab.modified) return;

    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 设置新的自动保存定时器（30秒后保存）
    autoSaveTimerRef.current = setTimeout(() => {
      if (activeTab.path && activeTab.modified) {
        handleSave(activeTab.id, false);
      }
    }, 30000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [activeTab.id, activeTab.content, activeTab.path, activeTab.modified, autoSaveEnabled]);

  // 保存代码
  const handleSave = useCallback(async (tabId, showMessage = true) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.path) {
      // 如果没有路径，提示用户先保存文件
      if (showMessage) {
        handleSaveAs(tabId);
      }
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/bigdata-ide/editor/save`, {
        path: tab.path,
        content: tab.content
      });

      // 更新标签页状态
      setTabs(prev => prev.map(t => 
        t.id === tabId ? { ...t, modified: false } : t
      ));

      if (showMessage) {
        console.log('保存成功');
      }
    } catch (error) {
      console.error('保存失败:', error);
      if (showMessage) {
        alert(`保存失败: ${error.response?.data?.detail || error.message}`);
      }
    }
  }, [tabs]);

  // 加载另存为对话框中的文件夹列表（文件管理 MinIO）
  const loadSaveAsFiles = useCallback(async (path) => {
    setSaveAsLoading(true);
    setSaveAsError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/bigdata-ide/files`, { params: { path: path || '' } });
      setSaveAsFileList(res.data.files || []);
    } catch (e) {
      setSaveAsError(e.response?.data?.detail || e.message || '加载失败');
      setSaveAsFileList([]);
    } finally {
      setSaveAsLoading(false);
    }
  }, []);

  // 打开另存为对话框
  const handleSaveAs = useCallback((tabId = null) => {
    const tab = tabId ? tabs.find(t => t.id === tabId) : activeTab;
    if (!tab) return;
    const defaultName = tab.path ? tab.name : `untitled.${tab.language === 'sql' ? 'sql' : 'py'}`;
    setSaveAsTabId(tab.id);
    setSaveAsCurrentPath('');
    setSaveAsFileName(defaultName);
    setSaveAsError('');
    setShowSaveAsDialog(true);
    loadSaveAsFiles('');
  }, [tabs, activeTab, activeTabId, loadSaveAsFiles]);

  // 另存为：进入子文件夹
  const handleSaveAsEnterFolder = useCallback((folderPath) => {
    setSaveAsCurrentPath(folderPath);
    loadSaveAsFiles(folderPath);
  }, [loadSaveAsFiles]);

  // 另存为：返回上级
  const handleSaveAsGoUp = useCallback(() => {
    if (!saveAsCurrentPath) return;
    const parent = saveAsCurrentPath.split('/').slice(0, -1).join('/');
    setSaveAsCurrentPath(parent);
    loadSaveAsFiles(parent);
  }, [saveAsCurrentPath, loadSaveAsFiles]);

  // 另存为：确认保存
  const handleSaveAsConfirm = useCallback(async () => {
    const tab = tabs.find(t => t.id === saveAsTabId);
    if (!tab) return;
    const name = saveAsFileName.trim();
    if (!name) {
      setSaveAsError('请输入文件名');
      return;
    }
    const fullPath = saveAsCurrentPath ? `${saveAsCurrentPath}/${name}` : name;
    setSaveAsSubmitting(true);
    setSaveAsError('');
    try {
      await axios.post(`${API_BASE_URL}/bigdata-ide/editor/save`, {
        path: fullPath,
        content: tab.content,
      });
      setTabs(prev => prev.map(t =>
        t.id === saveAsTabId ? { ...t, name, path: fullPath, modified: false } : t
      ));
      setShowSaveAsDialog(false);
    } catch (e) {
      setSaveAsError(e.response?.data?.detail || e.message || '保存失败');
    } finally {
      setSaveAsSubmitting(false);
    }
  }, [tabs, saveAsTabId, saveAsCurrentPath, saveAsFileName]);

  // 关闭另存为对话框时刷新列表（下次打开从根开始）
  const handleSaveAsDialogOpenChange = useCallback((open) => {
    if (!open) setShowSaveAsDialog(false);
  }, []);

  // 更新标签页内容
  const handleCodeChange = (newCode) => {
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        // 如果内容改变，标记为已修改
        const isModified = t.path ? (t.content !== newCode) : (newCode.trim() !== '');
        return { 
          ...t, 
          content: newCode, 
          modified: isModified
        };
      }
      return t;
    }));
  };

  // 新建标签页
  const handleNewTab = () => {
    const newId = `new-${Date.now()}`;
    // 新建标签页默认内容为空
    const defaultContent = '';
    const newTab = {
      id: newId,
      name: `Untitled-${tabs.length + 1}`,
      content: defaultContent,
      path: null,
      modified: false,
      language: language || 'python'
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
  };

  // 关闭标签页
  const handleCloseTab = (tabId, e) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.id === tabId);
    
    if (tab.modified) {
      if (!confirm(`文件 "${tab.name}" 有未保存的更改，确定要关闭吗？`)) {
        return;
      }
    }

    const newTabs = tabs.filter(t => t.id !== tabId);
    if (newTabs.length === 0) {
      // 如果关闭了所有标签，创建一个新标签
      handleNewTab();
    } else {
      setTabs(newTabs);
      if (activeTabId === tabId) {
        setActiveTabId(newTabs[0].id);
      }
    }
  };

  // 打开文件到编辑器
  const handleOpenFile = (filePath, fileName, content, fileType) => {
    // 检查是否已经打开
    const existingTab = tabs.find(t => t.path === filePath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    // 确定语言
    const getLanguageFromFile = (filename, fileType) => {
      const ext = filename.split('.').pop()?.toLowerCase();
      const langMap = {
        'py': 'python',
        'sql': 'sql',
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'html': 'html',
        'css': 'css',
        'json': 'json',
      };
      return langMap[ext] || 'python';
    };

    const newTab = {
      id: `file-${Date.now()}`,
      name: fileName,
      content: content,
      path: filePath,
      modified: false,
      language: getLanguageFromFile(fileName, fileType)
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  // 从文件管理打开：切到编辑器后挂载时再打开（此时 pendingFileOpen 由 App 传入）
  useEffect(() => {
    if (!pendingFileOpen) return;
    handleOpenFile(
      pendingFileOpen.path,
      pendingFileOpen.name,
      pendingFileOpen.content,
      pendingFileOpen.fileType
    );
    onFileOpened?.();
  }, [pendingFileOpen]);

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    openFile: handleOpenFile,
    getActiveTab: () => activeTab,
    getActiveCode: () => activeTab.content
  }));

  // 执行当前标签页的代码（传入内容与文件路径，供执行历史记录）
  const handleExecuteCurrent = useCallback(() => {
    if (onExecute && activeTab) {
      onExecute(activeTab.content, activeTab.path);
    }
  }, [onExecute, activeTab]);

  return (
    <div className="flex flex-col h-full">
      {/* 标签页栏 */}
      <div className="flex items-center bg-card border-b overflow-x-auto">
        <div className="flex items-center flex-1 min-w-0">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center gap-2 px-4 py-2 border-r border-border cursor-pointer transition-colors min-w-0 ${
                activeTabId === tab.id
                  ? 'bg-background border-b-2 border-b-primary'
                  : 'bg-card hover:bg-accent'
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs truncate max-w-[150px]">
                    {tab.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tab.name}</p>
                </TooltipContent>
              </Tooltip>
              {tab.modified && (
                <span className="text-xs text-orange-500">●</span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="ml-1 h-5 w-5"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>关闭</p>
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNewTab}
              className="border-l border-border rounded-none"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>新建标签页</p>
          </TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-2 px-3 border-l border-border">
          <Label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            <span>自动保存</span>
          </Label>
        </div>
      </div>

      {/* 编辑器 */}
      <div className="flex-1 min-h-0">
        {activeTab && (
          <EnhancedMonacoEditor
            language={activeTab.language}
            kernelType={kernelType}
            code={activeTab.content}
            onCodeChange={handleCodeChange}
            onExecute={handleExecuteCurrent}
            onSave={activeTab.path ? (path, content) => handleSave(activeTabId, true) : null}
            onSaveAs={() => handleSaveAs(activeTabId)}
            isExecuting={isExecuting}
            filePath={activeTab.path}
            isModified={activeTab.modified}
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          />
        )}
      </div>

      {/* 另存为：选择文件管理下的文件夹 + 重命名 */}
      <Dialog open={showSaveAsDialog} onOpenChange={handleSaveAsDialogOpenChange}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>另存为</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">选择保存位置（文件管理下的文件夹），并输入文件名。</p>
          {/* 当前路径面包屑 */}
          <div className="flex items-center gap-1 text-sm flex-wrap">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setSaveAsCurrentPath(''); loadSaveAsFiles(''); }}>
              根目录
            </Button>
            {saveAsCurrentPath && saveAsCurrentPath.split('/').filter(Boolean).map((part, i, arr) => (
              <React.Fragment key={i}>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    const path = arr.slice(0, i + 1).join('/');
                    setSaveAsCurrentPath(path);
                    loadSaveAsFiles(path);
                  }}
                >
                  {part}
                </Button>
              </React.Fragment>
            ))}
          </div>
          {/* 上级目录 */}
          {saveAsCurrentPath && (
            <Button variant="outline" size="sm" className="w-fit" onClick={handleSaveAsGoUp}>
              <FolderOpen className="h-4 w-4 mr-1" />
              上一级
            </Button>
          )}
          {/* 文件夹列表 */}
          <div className="border rounded-md min-h-[120px] max-h-[200px] overflow-y-auto p-2 space-y-1">
            {saveAsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">加载中...</span>
              </div>
            ) : (
              saveAsFileList
                .filter((f) => f.type === 'directory')
                .map((f) => (
                  <Button
                    key={f.path || f.name}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleSaveAsEnterFolder(f.path || (saveAsCurrentPath ? `${saveAsCurrentPath}/${f.name}` : f.name))}
                  >
                    <Folder className="h-4 w-4 mr-2 shrink-0" />
                    {f.name}
                  </Button>
                ))
            )}
            {!saveAsLoading && saveAsFileList.filter((f) => f.type === 'directory').length === 0 && saveAsFileList.length >= 0 && (
              <p className="text-sm text-muted-foreground py-2">当前目录下无子文件夹，可直接在此保存。</p>
            )}
          </div>
          {/* 文件名（可重命名） */}
          <div className="space-y-2">
            <Label>文件名</Label>
            <Input
              value={saveAsFileName}
              onChange={(e) => setSaveAsFileName(e.target.value)}
              placeholder="例如: example.py"
            />
          </div>
          {saveAsError && <p className="text-sm text-destructive">{saveAsError}</p>}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowSaveAsDialog(false)}>取消</Button>
            <Button onClick={handleSaveAsConfirm} disabled={saveAsSubmitting || !saveAsFileName.trim()}>
              {saveAsSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

TabbedEditor.displayName = 'TabbedEditor';

export default TabbedEditor;
