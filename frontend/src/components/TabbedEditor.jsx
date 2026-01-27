import React, { useState, useCallback, useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import axios from 'axios';
import { EnhancedMonacoEditor } from './EnhancedMonacoEditor';

const API_BASE_URL = '/api';

const TabbedEditor = forwardRef(({ 
  onExecute, 
  isExecuting, 
  kernelType, 
  language,
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
    const defaultContent = language === 'sql' 
      ? '-- 输入你的 SQL 代码\nSELECT 1 as test;'
      : '# 输入你的代码\nprint("Hello, BigData IDE!")';
    return [
      { id: 'new-1', name: 'Untitled-1', content: defaultContent, path: null, modified: false, language: language || 'python' }
    ];
  });
  const [activeTabId, setActiveTabId] = useState('new-1');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const autoSaveTimerRef = useRef(null);

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
        alert('请先通过文件管理器保存文件，或使用"另存为"功能');
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
    const defaultContent = language === 'sql' 
      ? '-- 输入你的 SQL 代码\nSELECT 1 as test;'
      : '# 输入你的代码\nprint("Hello, BigData IDE!")';
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

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    openFile: handleOpenFile,
    getActiveTab: () => activeTab,
    getActiveCode: () => activeTab.content
  }));

  // 执行当前标签页的代码
  const handleExecuteCurrent = useCallback(() => {
    if (onExecute && activeTab) {
      onExecute(activeTab.content);
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
              <span className="text-xs truncate max-w-[150px]" title={tab.name}>
                {tab.name}
              </span>
              {tab.modified && (
                <span className="text-xs text-orange-500">●</span>
              )}
              <button
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="ml-1 hover:bg-accent rounded px-1 text-muted-foreground hover:text-foreground"
                title="关闭"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={handleNewTab}
          className="px-3 py-2 hover:bg-accent border-l border-border"
          title="新建标签页"
        >
          ➕
        </button>
        <div className="flex items-center gap-2 px-3 border-l border-border">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            <span>自动保存</span>
          </label>
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
            isExecuting={isExecuting}
            filePath={activeTab.path}
            isModified={activeTab.modified}
          />
        )}
      </div>
    </div>
  );
});

TabbedEditor.displayName = 'TabbedEditor';

export default TabbedEditor;
