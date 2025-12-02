import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { EnhancedMonacoEditor } from './components/EnhancedMonacoEditor';
import './App.css';

// 自动检测 API 地址：优先使用 VITE_API_URL，其次使用相对路径 /api（Vite 会代理到后端）
// 在 Codespace 或其他远端环境中，相对路径通过 Vite 代理转发到本地 localhost:8888
const getAPIBaseURL = () => {
  if (import.meta.env.VITE_API_URL) {
    console.log('[App] Using VITE_API_URL:', import.meta.env.VITE_API_URL);
    return import.meta.env.VITE_API_URL;
  }
  // 开发环境下使用相对路径，Vite 代理会转发到 http://localhost:8888
  if (import.meta.env.DEV) {
    console.log('[App] Using relative path /api (Vite will proxy to localhost:8888)');
    return '/api';
  }
  // 生产环境下也使用相对路径（假设后端与前端部署在同一服务器）
  return '/api';
};

const API_BASE_URL = getAPIBaseURL();
console.log('[App] API_BASE_URL:', API_BASE_URL, 'DEV:', import.meta.env.DEV);

function App() {
  const [engine, setEngine] = useState('python');
  const [code, setCode] = useState('# 输入你的代码\nprint("Hello, BigData IDE!")');
  const [output, setOutput] = useState('');
  const [errors, setErrors] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  // 创建会话
  const createSession = useCallback(async (selectedEngine) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/sessions`,
        {},
        { params: { engine: selectedEngine } }
      );
      setSessionId(response.data.session_id);
      return response.data.session_id;
    } catch (error) {
      // 打印完整错误，包含 axios 的 response/request 以便调试
      console.error('Failed to create session full error:', error);
      if (error.response) {
        console.error('createSession response data:', error.response.data);
      } else if (error.request) {
        console.error('createSession no response, request sent:', error.request);
      }
      // 将错误对象附到 window，方便在浏览器 Console 中检查
      try { window.__LAST_CREATE_SESSION_ERROR__ = error; } catch (e) {}

      setErrors(`Failed to create session: ${error.message}`);
      return null;
    }
  }, []);

  // 执行代码
  const handleExecute = useCallback(async (codeToExecute) => {
    if (!codeToExecute.trim()) {
      setErrors('请输入代码');
      return;
    }

    setIsExecuting(true);
    setOutput('');
    setErrors('');

    try {
      const sid = sessionId || (await createSession(engine));
      
      const response = await axios.post(
        `${API_BASE_URL}/execute`,
        {
          engine: engine,
          code: codeToExecute,
          session_id: sid
        }
      );

      if (response.data.status === 'ok') {
        setOutput(response.data.output || '(无输出)');
        if (response.data.errors) {
          setErrors(response.data.errors);
        }
      } else {
        setErrors(response.data.errors || 'Execution failed');
      }
    } catch (error) {
      // 打印完整错误信息，帮助定位网络/CORS/后端错误
      console.error('Execution error full:', error);
      if (error.response) {
        console.error('Execution response data:', error.response.data);
      } else if (error.request) {
        console.error('Execution no response, request sent:', error.request);
      }
      try { window.__LAST_EXECUTION_ERROR__ = error; } catch (e) {}

      // 为用户显示更友好的错误信息
      const msg = error.response?.data?.message || error.message || 'Execution error';
      setErrors(`Execution error: ${msg}`);
      setOutput('');
    } finally {
      setIsExecuting(false);
    }
  }, [engine, sessionId, createSession]);

  // 切换引擎
  const handleEngineChange = useCallback(async (newEngine) => {
    setEngine(newEngine);
    setCode('');
    setOutput('');
    setErrors('');
    
    // 为新引擎创建会话
    const newSessionId = await createSession(newEngine);
    setSessionId(newSessionId);
  }, [createSession]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>BigData IDE</h1>
        <p>多引擎代码执行平台</p>
      </header>

      <div className="app-container">
        {/* 侧边栏 - 引擎选择 */}
        <aside className="engine-selector">
          <h3>执行引擎</h3>
          <div className="engine-buttons">
            {['python', 'spark', 'flink', 'sql'].map((eng) => (
              <button
                key={eng}
                className={`engine-btn ${engine === eng ? 'active' : ''}`}
                onClick={() => handleEngineChange(eng)}
              >
                <span className="icon">⚙️</span>
                <span className="label">{eng.toUpperCase()}</span>
              </button>
            ))}
          </div>

          <div className="session-info">
            <h4>会话</h4>
            {sessionId ? (
              <p className="session-id">
                <small>{sessionId.substring(0, 8)}...</small>
              </p>
            ) : (
              <p style={{ color: '#999', fontSize: '12px' }}>
                执行代码时自动创建
              </p>
            )}
          </div>
        </aside>

        {/* 主编辑区 */}
        <main className="editor-main">
          <div className="editor-panel">
            <h2>代码编辑器</h2>
            <EnhancedMonacoEditor
              engine={engine}
              code={code}
              onCodeChange={setCode}
              onExecute={handleExecute}
              isExecuting={isExecuting}
            />
          </div>

          {/* 输出面板 */}
          <div className="output-panel">
            <h2>执行结果</h2>
            
            {/* 错误输出 */}
            {errors && (
              <div className="output-section error">
                <h4>❌ 错误</h4>
                <pre className="output-content">{errors}</pre>
              </div>
            )}

            {/* 标准输出 */}
            {output && (
              <div className="output-section">
                <h4>✅ 输出</h4>
                <pre className="output-content">{output}</pre>
              </div>
            )}

            {/* 空状态 */}
            {!output && !errors && (
              <div className="output-empty">
                <p>执行代码后，结果将显示在这里</p>
                <p style={{ fontSize: '12px', color: '#999' }}>
                  快捷键: Ctrl+Enter 执行代码
                </p>
              </div>
            )}

            {isExecuting && (
              <div className="output-section">
                <p>⏳ 正在执行...</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
