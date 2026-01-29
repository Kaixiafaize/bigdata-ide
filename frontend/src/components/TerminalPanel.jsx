import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const getTerminalWsUrl = () => {
  const base = import.meta.env.VITE_API_URL || '';
  if (base) {
    const u = new URL(base);
    return `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}${u.pathname.replace(/\/?$/, '')}/api/bigdata-ide/terminal/ws`;
  }
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/bigdata-ide/terminal/ws`;
};

export default function TerminalPanel({ theme = 'dark' }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const localEchoRef = useRef(true); // Windows PIPE 需本地回显，Unix PTY 不需

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: theme === 'dark'
        ? { background: '#0d1117', foreground: '#c9d1d9', cursor: '#c9d1d9', cursorAccent: '#0d1117' }
        : { background: '#f6f8fa', foreground: '#24292f', cursor: '#24292f', cursorAccent: '#f6f8fa' },
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    term.writeln('正在连接终端...');
    fitAddon.fit();
    term.focus();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    const fitLater = () => {
      setTimeout(() => fitAddon.fit(), 100);
      setTimeout(() => fitAddon.fit(), 500);
    };
    fitLater();
    const ro = new ResizeObserver(() => fitAddon.fit());
    ro.observe(containerRef.current);

    const wsUrl = getTerminalWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      term.writeln('终端已连接（后端 shell），可输入命令。');
      fitAddon.fit();
    };
    ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') {
        try {
          const msg = JSON.parse(evt.data);
          if (msg && msg.type === 'terminal_mode' && typeof msg.local_echo === 'boolean') {
            localEchoRef.current = msg.local_echo;
            return;
          }
        } catch (_) {}
        term.write(evt.data);
      } else {
        const reader = new FileReader();
        reader.onload = () => term.write(reader.result);
        reader.readAsText(new Blob([evt.data]));
      }
    };
    ws.onclose = () => {
      term.writeln('\r\n终端连接已关闭。');
    };
    ws.onerror = () => {
      term.writeln('\r\n终端连接错误，请确认后端已启动。');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
      if (localEchoRef.current) {
        term.write(data);
      }
    });

    const onResize = () => fitAddon.fit();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!terminalRef.current || !fitAddonRef.current) return;
    const term = terminalRef.current;
    term.options.theme = theme === 'dark'
      ? { background: '#0d1117', foreground: '#c9d1d9', cursor: '#c9d1d9', cursorAccent: '#0d1117' }
      : { background: '#f6f8fa', foreground: '#24292f', cursor: '#24292f', cursorAccent: '#f6f8fa' };
    fitAddonRef.current.fit();
  }, [theme]);

  const containerBg = theme === 'dark' ? '#0d1117' : '#f6f8fa';

  const handleContainerClick = () => {
    terminalRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      role="application"
      tabIndex={0}
      className="h-full w-full p-2 rounded overflow-hidden outline-none"
      style={{ minHeight: 200, height: '100%', backgroundColor: containerBg }}
      onClick={handleContainerClick}
      onFocus={() => terminalRef.current?.focus()}
    />
  );
}
