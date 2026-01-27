import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import TabbedEditor from './components/TabbedEditor';
import FileManager from './components/FileManager';
import DatabaseConnectionManager from './components/DatabaseConnectionManager';
import ExecutionHistory from './components/ExecutionHistory';

// Jupyter Server API 基础 URL
const getAPIBaseURL = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return '/api';
};

const API_BASE_URL = getAPIBaseURL();

function App() {
  const [activeTab, setActiveTab] = useState('editor'); // 'editor', 'files', 'database', 'history'
  const [kernelTypes, setKernelTypes] = useState([]);
  const [selectedKernelType, setSelectedKernelType] = useState(null);
  const [output, setOutput] = useState('');
  const [errors, setErrors] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [kernelId, setKernelId] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [kernelStatus, setKernelStatus] = useState('idle');
  const [sessionInfoCollapsed, setSessionInfoCollapsed] = useState(false);
  const wsRef = useRef(null);
  const messageQueueRef = useRef([]);
  const tabbedEditorRef = useRef(null);

  // 加载可用的 kernel 类型
  useEffect(() => {
    const loadKernelTypes = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/bigdata-ide/kernel-types`);
        const types = response.data.kernel_types || [];
        setKernelTypes(types);
        
        // 默认选择第一个可用的 kernel
        const availableType = types.find(t => t.available) || types[0];
        if (availableType) {
          setSelectedKernelType(availableType.id);
        }
      } catch (error) {
        console.error('Failed to load kernel types:', error);
        setErrors(`无法加载 kernel 类型: ${error.message}`);
      }
    };
    
    loadKernelTypes();
  }, []);

  // 获取当前选中的 kernel 配置
  const getCurrentKernelConfig = () => {
    return kernelTypes.find(kt => kt.id === selectedKernelType);
  };

  // 创建会话并连接 WebSocket
  const createSession = useCallback(async (kernelTypeId) => {
    try {
      // 关闭现有连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // 创建新会话
      const response = await axios.post(
        `${API_BASE_URL}/bigdata-ide/sessions`,
        { kernel_type: kernelTypeId }
      );
      
      const session = response.data;
      const sid = session.id;
      const kid = session.kernel?.id;
      
      setSessionId(sid);
      setKernelId(kid);
      setWsConnected(false);
      messageQueueRef.current = [];

      if (!sid) {
        throw new Error('Session ID not found in response');
      }

      // 连接 WebSocket (FastAPI 的 WebSocket 端点)
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${window.location.host}${API_BASE_URL}/bigdata-ide/ws/${sid}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        const config = getCurrentKernelConfig();
        setKernelStatus(`${config?.name || kernelTypeId} (已连接)`);
        
        // 发送队列中的消息
        while (messageQueueRef.current.length > 0) {
          const msg = messageQueueRef.current.shift();
          ws.send(JSON.stringify(msg));
        }
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          handleFastAPIMessage(msg);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        setKernelStatus('已断开');
        wsRef.current = null;
      };

      ws.onerror = (err) => {
        console.error('WebSocket error', err);
        setErrors('WebSocket 连接错误');
      };

      return { sessionId: sid, kernelId: kid };
    } catch (error) {
      console.error('Failed to create session:', error);
      setErrors(`创建会话失败: ${error.response?.data?.message || error.message}`);
      return null;
    }
  }, [kernelTypes, selectedKernelType]);

  // 处理 FastAPI WebSocket 消息
  const handleFastAPIMessage = (msg) => {
    const msgType = msg.type;

    switch (msgType) {
      case 'stream':
        const text = msg.output || '';
        setOutput(prev => prev + text);
        break;
      
      case 'result':
        const result = msg.output || '';
        setOutput(prev => prev + result + '\n');
        break;
      
      case 'error':
        const errorMsg = msg.error || '';
        setErrors(prev => prev ? prev + '\n' + errorMsg : errorMsg);
        break;
      
      case 'status':
        const execState = msg.status;
        if (execState === 'executing' || execState === 'busy') {
          setKernelStatus('执行中...');
          setIsExecuting(true);
        } else if (execState === 'idle') {
          setKernelStatus('空闲');
          setIsExecuting(false);
        }
        break;
      
      case 'complete':
        // complete 消息只用于标记执行完成，输出已经通过 stream/result 消息发送过了
        setIsExecuting(false);
        setKernelStatus('空闲');
        break;
      
      default:
        console.debug('Unhandled message type:', msgType, msg);
    }
  };

  // 执行代码
  const handleExecute = useCallback(async (codeToExecute) => {
    if (!codeToExecute.trim()) {
      setErrors('请输入代码');
      return;
    }

    if (!selectedKernelType) {
      setErrors('请先选择一个 kernel 类型');
      return;
    }

    setIsExecuting(true);
    setOutput('');
    setErrors('');
    setKernelStatus('执行中...');

    try {
      let sid = sessionId;
      let kid = kernelId;

      if (!sid || !kid || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        const session = await createSession(selectedKernelType);
        if (!session) {
          setIsExecuting(false);
          return;
        }
        sid = session.sessionId;
        kid = session.kernelId;
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
          wsRef.current.onopen = () => {
            clearTimeout(timeout);
            resolve();
          };
          wsRef.current.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('WebSocket connection failed'));
          };
        });
      }

      const executeRequest = {
        type: 'execute',
        code: codeToExecute,
      };

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(executeRequest));
      } else {
        messageQueueRef.current.push(executeRequest);
        setErrors('WebSocket 未连接，消息已加入队列');
      }
    } catch (error) {
      console.error('Execution error:', error);
      setErrors(`执行错误: ${error.message}`);
      setIsExecuting(false);
      setKernelStatus('错误');
    }
  }, [selectedKernelType, sessionId, kernelId, createSession]);

  // 切换 kernel 类型
  const handleKernelTypeChange = async (kernelTypeId) => {
    setSelectedKernelType(kernelTypeId);
    setSessionId(null);
    setKernelId(null);
    setOutput('');
    setErrors('');
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  // 处理文件打开
  const handleFileOpen = (filename, content, fileType) => {
    if (tabbedEditorRef.current && tabbedEditorRef.current.openFile) {
      tabbedEditorRef.current.openFile(filename, filename, content, fileType);
    }
    setActiveTab('editor');
  };

  // 处理数据库连接选择
  const handleConnectionSelect = (connectionString) => {
    // 在 SQL kernel 中使用选中的连接
    if (selectedKernelType === 'postgres' || selectedKernelType === 'starrocks') {
      // 这里可以将连接字符串注入到代码中
      console.log('Selected connection:', connectionString);
    }
  };

  // 清理：组件卸载时关闭 WebSocket
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const currentConfig = getCurrentKernelConfig();

  return (
    <div className="flex flex-col h-screen bg-background text-foreground dark">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">BigData IDE</h1>
            <p className="text-sm text-muted-foreground mt-1">基于 FastAPI 和 Jupyter Client 的多 Kernel IDE</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-3 py-1.5 bg-muted rounded-md text-sm text-muted-foreground border">
              状态: {kernelStatus}
            </div>
          </div>
        </div>
        
        {/* Kernel 类型选择 - 移到顶部 */}
        <div className="px-6 py-3 border-t bg-background">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kernel 类型:</span>
            {kernelTypes.map((kt) => (
              <button
                key={kt.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  selectedKernelType === kt.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground'
                } ${!kt.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => handleKernelTypeChange(kt.id)}
                disabled={!kt.available}
                title={!kt.available ? `Kernel '${kt.kernel_spec}' 不可用` : ''}
              >
                <span className="text-base">
                  {kt.language === 'python' ? '🐍' : '🗂️'}
                </span>
                <span>{kt.name}</span>
                {!kt.available && (
                  <span className="px-1.5 py-0.5 bg-destructive text-destructive-foreground text-xs rounded">不可用</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧菜单栏 - 标签页 */}
        <aside className="w-48 bg-card border-r flex flex-col">
          <div className="p-2 space-y-1">
            <button
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'editor'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
              onClick={() => setActiveTab('editor')}
            >
              <span className="text-base">📝</span>
              <span className="text-left">代码编辑器</span>
            </button>
            <button
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'files'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
              onClick={() => setActiveTab('files')}
            >
              <span className="text-base">📁</span>
              <span className="text-left">文件管理</span>
            </button>
            <button
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'database'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
              onClick={() => setActiveTab('database')}
            >
              <span className="text-base">🗄️</span>
              <span className="text-left">数据库连接</span>
            </button>
            <button
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'history'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
              onClick={() => setActiveTab('history')}
            >
              <span className="text-base">📜</span>
              <span className="text-left">执行历史</span>
            </button>
          </div>

          {/* 会话信息 - 可收起 */}
          <div className="mt-auto border-t p-2">
            <button
              onClick={() => setSessionInfoCollapsed(!sessionInfoCollapsed)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-accent rounded-md transition-colors"
            >
              <span>当前会话</span>
              <span className="text-base">{sessionInfoCollapsed ? '▼' : '▲'}</span>
            </button>
            {!sessionInfoCollapsed && (
              <div className="mt-2 p-3 bg-muted rounded-md border text-xs space-y-2">
                {currentConfig && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kernel:</span>
                      <span className="text-foreground font-medium">{currentConfig.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">语言:</span>
                      <span className="text-foreground font-medium">{currentConfig.language.toUpperCase()}</span>
                    </div>
                  </>
                )}
                {sessionId && (
                  <div className="pt-2 border-t">
                    <div className="text-muted-foreground break-all">
                      <span className="font-medium">Session:</span> {sessionId.substring(0, 16)}...
                    </div>
                  </div>
                )}
                {kernelId && (
                  <div className="text-muted-foreground break-all">
                    <span className="font-medium">Kernel:</span> {kernelId.substring(0, 16)}...
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* 编辑器标签页 */}
          {activeTab === 'editor' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 flex flex-col bg-card border-b">
                <div className="flex-1 min-h-0">
                  <TabbedEditor
                    ref={tabbedEditorRef}
                    onExecute={handleExecute}
                    isExecuting={isExecuting}
                    kernelType={selectedKernelType}
                    language={currentConfig?.language || 'python'}
                    wsRef={wsRef}
                    messageQueueRef={messageQueueRef}
                    sessionId={sessionId}
                    setSessionId={setSessionId}
                    setKernelId={setKernelId}
                    setWsConnected={setWsConnected}
                    wsConnected={wsConnected}
                    createSession={createSession}
                  />
                </div>
              </div>

              {/* 输出面板 */}
              <div className="h-80 flex flex-col bg-card overflow-hidden">
                <div className="px-4 py-2 bg-background border-b">
                  <h2 className="text-sm font-semibold text-foreground">执行结果</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {errors && (
                    <div className="p-3 bg-destructive/10 border-l-4 border-destructive rounded">
                      <h4 className="text-sm font-semibold text-destructive mb-2">❌ 错误</h4>
                      <pre className="text-sm text-destructive/90 whitespace-pre-wrap font-mono">{errors}</pre>
                    </div>
                  )}

                  {output && (
                    <div className="p-3 bg-muted rounded border">
                      <h4 className="text-sm font-semibold text-foreground mb-2">✅ 输出</h4>
                      <pre className="text-sm text-green-600 dark:text-green-400 whitespace-pre-wrap font-mono">{output}</pre>
                    </div>
                  )}

                  {!output && !errors && !isExecuting && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <p className="text-sm">执行代码后，结果将显示在这里</p>
                      <p className="text-xs mt-2">快捷键: Ctrl+Enter 执行代码</p>
                    </div>
                  )}

                  {isExecuting && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                      <span className="text-sm">⏳ 正在执行...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 文件管理标签页 */}
          {activeTab === 'files' && (
            <div className="flex-1 overflow-hidden">
              <FileManager
                onFileSelect={(file) => console.log('Selected:', file)}
                onFileOpen={handleFileOpen}
              />
            </div>
          )}

          {/* 数据库连接管理标签页 */}
          {activeTab === 'database' && (
            <div className="flex-1 overflow-hidden p-4">
              <DatabaseConnectionManager
                onConnectionSelect={handleConnectionSelect}
              />
            </div>
          )}

          {/* 执行历史标签页 */}
          {activeTab === 'history' && (
            <div className="flex-1 overflow-hidden p-4">
              <ExecutionHistory
                onReExecute={(code) => {
                  setActiveTab('editor');
                  // 延迟执行，确保编辑器已切换
                  setTimeout(() => {
                    handleExecute(code);
                  }, 100);
                }}
              />
            </div>
          )}
        </main>
      </div>

      {/* 状态栏 */}
      <div className="h-9 bg-card border-t flex items-center justify-between px-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          {currentConfig && (
            <>
              <div className="px-2 py-1 bg-muted rounded text-xs">Kernel: {currentConfig.name}</div>
              <div className="px-2 py-1 bg-muted rounded text-xs">Lang: {currentConfig.language.toUpperCase()}</div>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-2 py-1 bg-muted rounded text-xs ${wsConnected ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            {wsConnected ? 'WS: 已连接' : 'WS: 未连接'}
          </div>
          {sessionId && (
            <div className="px-2 py-1 bg-muted rounded text-xs">Session: {sessionId.substring(0, 8)}...</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
