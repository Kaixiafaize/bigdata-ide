import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { EnhancedMonacoEditor } from './components/EnhancedMonacoEditor';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8888';

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
        `${API_BASE_URL}/api/sessions`,
        {},
        { params: { engine: selectedEngine } }
      );
      setSessionId(response.data.session_id);
      return response.data.session_id;
    } catch (error) {
      console.error('Failed to create session:', error);
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
        `${API_BASE_URL}/api/execute`,
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
      console.error('Execution error:', error);
      setErrors(`Execution error: ${error.message}`);
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
