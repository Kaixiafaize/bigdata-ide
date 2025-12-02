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
  const [language, setLanguage] = useState('python');  // 'python' 或 'sql'
  const [engine, setEngine] = useState(null);  // null, 'spark', 'flink'
  const [code, setCode] = useState('# 输入你的代码\nprint("Hello, BigData IDE!")');
  const [output, setOutput] = useState('');
  const [errors, setErrors] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  // 根据语言获取可用的引擎
  const getAvailableEngines = () => {
    if (language === 'python' || language === 'sql') {
      return [
        { value: null, label: '无引擎 (普通)' },
        { value: 'spark', label: 'Spark' },
        { value: 'flink', label: 'Flink' }
      ];
    }
    return [];
  };

  // 当语言改变时重置引擎
  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    setEngine(null);  // 重置引擎
    
    // 更新代码模板
    if (newLang === 'python') {
      setCode('# 输入你的 Python 代码\nprint("Hello, BigData IDE!")');
    } else if (newLang === 'sql') {
      setCode('-- 输入你的 SQL 代码\nSELECT 1 as test;');
    }
  };

  // 创建会话
  const createSession = useCallback(async (selectedLanguage, selectedEngine) => {
    try {
      const params = new URLSearchParams();
      params.append('language', selectedLanguage);
      if (selectedEngine) {
        params.append('engine', selectedEngine);
      }
      
      const response = await axios.post(
        `${API_BASE_URL}/sessions?${params}`,
        {}
      );
      setSessionId(response.data.session_id);
      return response.data.session_id;
    } catch (error) {
      console.error('Failed to create session full error:', error);
      if (error.response) {
        console.error('createSession response data:', error.response.data);
      } else if (error.request) {
        console.error('createSession no response, request sent:', error.request);
      }
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
      const sid = sessionId || (await createSession(language, engine));
      
      const response = await axios.post(
        `${API_BASE_URL}/execute`,
        {
          language: language,
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
      console.error('Execution error full:', error);
      if (error.response) {
        console.error('Execution response data:', error.response.data);
      } else if (error.request) {
        console.error('Execution no response, request sent:', error.request);
      }
      try { window.__LAST_EXECUTION_ERROR__ = error; } catch (e) {}

      const msg = error.response?.data?.message || error.message || 'Execution error';
      setErrors(`Execution error: ${msg}`);
      setOutput('');
    } finally {
      setIsExecuting(false);
    }
  }, [language, engine, sessionId, createSession]);

  // 切换语言
  const handleLanguageChangeWrapper = (lang) => {
    setLanguage(lang);
    setEngine(null);  // 重置引擎
    setSessionId(null);
    setOutput('');
    setErrors('');
    
    // 更新代码模板
    if (lang === 'python') {
      setCode('# 输入你的 Python 代码\nprint("Hello, BigData IDE!")');
    } else if (lang === 'sql') {
      setCode('-- 输入你的 SQL 代码\nSELECT 1 as test;');
    }
  };

  // 切换引擎
  const handleEngineChange = (newEngine) => {
    setEngine(newEngine);
    setOutput('');
    setErrors('');
    setSessionId(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>BigData IDE</h1>
        <p>多语言多引擎代码执行平台</p>
      </header>

      <div className="app-container">
        {/* 侧边栏 - 语言和引擎选择 */}
        <aside className="language-engine-selector">
          {/* 语言选择 */}
          <section className="selector-section">
            <h3>编程语言</h3>
            <div className="language-buttons">
              {['python', 'sql'].map((lang) => (
                <button
                  key={lang}
                  className={`lang-btn ${language === lang ? 'active' : ''}`}
                  onClick={() => handleLanguageChangeWrapper(lang)}
                >
                  <span className="icon">
                    {lang === 'python' ? '🐍' : '🗂️'}
                  </span>
                  <span className="label">{lang === 'python' ? 'Python' : 'SQL'}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 引擎选择 */}
          <section className="selector-section">
            <h3>执行引擎</h3>
            <div className="engine-buttons">
              {getAvailableEngines().map((opt) => (
                <button
                  key={opt.value || 'none'}
                  className={`engine-btn ${engine === opt.value ? 'active' : ''}`}
                  onClick={() => handleEngineChange(opt.value)}
                >
                  <span className="icon">
                    {opt.value === 'spark' ? '⚡' : opt.value === 'flink' ? '🌊' : '⚙️'}
                  </span>
                  <span className="label">{opt.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 会话信息 */}
          <section className="selector-section">
            <h3>当前会话</h3>
            <div className="session-info">
              <p><strong>语言:</strong> {language.toUpperCase()}</p>
              <p><strong>引擎:</strong> {engine ? engine.toUpperCase() : '无'}</p>
              {sessionId && (
                <p style={{ fontSize: '12px', color: '#666', wordBreak: 'break-all' }}>
                  <strong>ID:</strong> {sessionId.substring(0, 12)}...
                </p>
              )}
            </div>
          </section>
        </aside>

        {/* 主编辑区 */}
        <main className="editor-main">
          <div className="editor-panel">
            <h2>代码编辑器</h2>
            <EnhancedMonacoEditor
              language={language}
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
