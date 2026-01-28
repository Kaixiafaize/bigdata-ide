import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import TabbedEditor from './components/TabbedEditor';
import FileManager from './components/FileManager';
import DatabaseConnectionManager from './components/DatabaseConnectionManager';
import ExecutionHistory from './components/ExecutionHistory';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Separator } from './components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
import { Sun, Moon, Code, Database as DatabaseIcon, FileEdit, Folder, History, ChevronUp, ChevronDown, CheckCircle, XCircle, Loader2, Sparkles } from 'lucide-react';

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
  const [outputPanelCollapsed, setOutputPanelCollapsed] = useState(false);
  const [theme, setTheme] = useState('dark'); // 'light' or 'dark'
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

  // 主题切换
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    // 更新根元素的 class
    const root = document.documentElement;
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    // 保存到 localStorage
    localStorage.setItem('theme', newTheme);
  };

  // 初始化主题
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    const root = document.documentElement;
    if (savedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  return (
    <TooltipProvider>
      <div className={`flex flex-col h-screen bg-background text-foreground ${theme === 'dark' ? 'dark' : ''}`}>
        {/* Header */}
        <header className="border-b bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-primary/60 shadow-lg">
              <div className="relative">
                <Code className="h-6 w-6 text-primary-foreground" />
                <Sparkles className="h-3 w-3 text-primary-foreground absolute -top-1 -right-1" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  BigData IDE
                </span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={toggleTheme}
                  variant="ghost"
                  size="sm"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4 mr-1" /> : <Moon className="h-4 w-4 mr-1" />}
                  {theme === 'dark' ? '浅色' : '深色'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        
        {/* Kernel 类型选择 - 移到顶部 */}
        <div className="px-6 py-3 border-t bg-background">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kernel 类型:</span>
            {kernelTypes.map((kt) => (
              <Tooltip key={kt.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={selectedKernelType === kt.id ? "default" : "secondary"}
                    size="sm"
                    onClick={() => handleKernelTypeChange(kt.id)}
                    disabled={!kt.available}
                    className="flex items-center gap-2"
                  >
                    {kt.language === 'python' ? <Code className="h-4 w-4" /> : <DatabaseIcon className="h-4 w-4" />}
                    <span>{kt.name}</span>
                    {!kt.available && (
                      <Badge variant="destructive" className="ml-1">不可用</Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                {!kt.available && (
                  <TooltipContent>
                    <p>Kernel '{kt.kernel_spec}' 不可用</p>
                  </TooltipContent>
                )}
              </Tooltip>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧菜单栏 - 标签页 */}
        <aside className="w-48 bg-card border-r flex flex-col">
          <div className="p-2 space-y-1">
            <Button
              variant={activeTab === 'editor' ? "default" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setActiveTab('editor')}
            >
              <FileEdit className="h-4 w-4" />
              <span>代码编辑器</span>
            </Button>
            <Button
              variant={activeTab === 'files' ? "default" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setActiveTab('files')}
            >
              <Folder className="h-4 w-4" />
              <span>文件管理</span>
            </Button>
            <Button
              variant={activeTab === 'database' ? "default" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setActiveTab('database')}
            >
              <DatabaseIcon className="h-4 w-4" />
              <span>数据库连接</span>
            </Button>
            <Button
              variant={activeTab === 'history' ? "default" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setActiveTab('history')}
            >
              <History className="h-4 w-4" />
              <span>执行历史</span>
            </Button>
          </div>

          {/* 会话信息 - 可收起 */}
          <div className="mt-auto border-t p-2">
            <Button
              variant="ghost"
              onClick={() => setSessionInfoCollapsed(!sessionInfoCollapsed)}
              className="w-full justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider h-auto py-2"
            >
              <span>当前会话</span>
              {sessionInfoCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            {!sessionInfoCollapsed && (
              <Card className="mt-2">
                <CardContent className="p-3 text-xs space-y-2">
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
                    <>
                      <Separator className="my-2" />
                      <div className="text-muted-foreground break-all">
                        <span className="font-medium">Session:</span> {sessionId.substring(0, 16)}...
                      </div>
                    </>
                  )}
                  {kernelId && (
                    <div className="text-muted-foreground break-all">
                      <span className="font-medium">Kernel:</span> {kernelId.substring(0, 16)}...
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* 编辑器标签页 */}
          {activeTab === 'editor' && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* 编辑器区域 */}
              <div className="flex-1 min-h-0 flex flex-col bg-card border-b overflow-hidden">
                <div className="flex-1 min-h-0 overflow-hidden">
                  <TabbedEditor
                    ref={tabbedEditorRef}
                    onExecute={handleExecute}
                    isExecuting={isExecuting}
                    kernelType={selectedKernelType}
                    language={currentConfig?.language || 'python'}
                    theme={theme}
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
              <Card className={`${outputPanelCollapsed ? 'h-10' : 'h-80'} flex-shrink-0 flex flex-col border-t overflow-hidden transition-all duration-300`}>
                <CardHeader 
                  className="px-4 py-2 flex-shrink-0 cursor-pointer"
                  onClick={() => setOutputPanelCollapsed(!outputPanelCollapsed)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">执行结果</CardTitle>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOutputPanelCollapsed(!outputPanelCollapsed);
                          }}
                        >
                          {outputPanelCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{outputPanelCollapsed ? '展开输出面板' : '收起输出面板'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardHeader>
                {!outputPanelCollapsed && (
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                  {errors && (
                    <Card className="border-destructive bg-destructive/10">
                      <CardContent className="p-3">
                        <h4 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                          <XCircle className="h-4 w-4" />
                          错误
                        </h4>
                        <pre className="text-sm text-destructive/90 whitespace-pre-wrap font-mono">{errors}</pre>
                      </CardContent>
                    </Card>
                  )}

                  {output && (
                    <Card>
                      <CardContent className="p-3">
                        <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          输出
                        </h4>
                        <pre className="text-sm text-green-600 dark:text-green-400 whitespace-pre-wrap font-mono">{output}</pre>
                      </CardContent>
                    </Card>
                  )}

                  {!output && !errors && !isExecuting && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <p className="text-sm">执行代码后，结果将显示在这里</p>
                      <p className="text-xs mt-2">快捷键: Ctrl+Enter 执行代码</p>
                    </div>
                  )}

                  {isExecuting && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">正在执行...</span>
                    </div>
                  )}
                </CardContent>
                )}
              </Card>
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
      <div className="h-9 bg-card border-t flex items-center justify-between px-4 text-xs">
        <div className="flex items-center gap-4">
          {currentConfig && (
            <>
              <Badge variant="secondary">Kernel: {currentConfig.name}</Badge>
              <Badge variant="secondary">Lang: {currentConfig.language.toUpperCase()}</Badge>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          {sessionId && (
            <Badge variant="secondary">Session: {sessionId.substring(0, 8)}...</Badge>
          )}
        </div>
      </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
