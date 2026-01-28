import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { RefreshCw, Play, Trash2, X, CheckCircle, XCircle, Circle } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const API_BASE_URL = '/api';

const ExecutionHistory = ({ onReExecute }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [expandedItems, setExpandedItems] = useState(new Set());

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/bigdata-ide/history?limit=100`);
      setHistory(response.data || []);
    } catch (err) {
      setError(`加载历史记录失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    // 每30秒刷新一次
    const interval = setInterval(loadHistory, 30000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  // 删除历史记录
  const handleDelete = async (historyId, e) => {
    e.stopPropagation();
    if (!confirm('确定要删除这条历史记录吗？')) return;

    try {
      await axios.delete(`${API_BASE_URL}/bigdata-ide/history/${historyId}`);
      setHistory(prev => prev.filter(h => h.id !== historyId));
    } catch (err) {
      setError(`删除失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  // 清空所有历史记录
  const handleClearAll = async () => {
    if (!confirm('确定要清空所有历史记录吗？此操作不可恢复。')) return;

    try {
      await axios.delete(`${API_BASE_URL}/bigdata-ide/history`);
      setHistory([]);
    } catch (err) {
      setError(`清空失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  // 切换展开/折叠
  const toggleExpand = (historyId) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(historyId)) {
        newSet.delete(historyId);
      } else {
        newSet.add(historyId);
      }
      return newSet;
    });
  };

  // 格式化时间
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // 格式化执行时间
  const formatExecutionTime = (seconds) => {
    if (seconds < 1) {
      return `${(seconds * 1000).toFixed(0)}ms`;
    }
    return `${seconds.toFixed(2)}s`;
  };

  // 截断代码
  const truncateCode = (code, maxLength = 100) => {
    if (code.length <= maxLength) return code;
    return code.substring(0, maxLength) + '...';
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border">
      <div className="flex justify-between items-center px-4 py-3 border-b">
        <h3 className="text-lg font-semibold text-foreground">执行历史</h3>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadHistory}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>刷新</p>
            </TooltipContent>
          </Tooltip>
          {history.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="text-destructive"
                >
                  清空
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>清空所有</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-l-4 border-destructive text-destructive text-sm">
          {error}
          <Button variant="ghost" size="icon" onClick={() => setError('')} className="ml-2 h-6 w-6">
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading && history.length === 0 && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            加载中...
          </div>
        )}

        {!loading && history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <p className="text-sm">暂无执行历史</p>
            <p className="text-xs mt-2">执行代码后，历史记录将显示在这里</p>
          </div>
        )}

        {history.map((item) => {
          const isExpanded = expandedItems.has(item.id);
          const isSelected = selectedHistory?.id === item.id;

          return (
            <div
              key={item.id}
              className={`mb-3 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-primary/10 border-primary'
                  : 'bg-muted hover:bg-accent'
              }`}
            >
              {/* 头部 */}
              <div
                className="p-3 cursor-pointer"
                onClick={() => toggleExpand(item.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1 ${
                        item.status === 'success'
                          ? 'bg-green-600 text-white'
                          : item.status === 'error'
                          ? 'bg-destructive text-destructive-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {item.status === 'success' ? <CheckCircle className="h-3 w-3" /> : item.status === 'error' ? <XCircle className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                        {item.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.language.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.kernel_type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatExecutionTime(item.execution_time)}
                      </span>
                    </div>
                    <div className="text-xs text-foreground font-mono mt-1 break-all">
                      {isExpanded ? item.code : truncateCode(item.code)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatTime(item.created_at)}
                    </div>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {onReExecute && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setSelectedHistory(item);
                              onReExecute(item.code);
                            }}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>重新执行</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDelete(item.id, e)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>删除</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* 展开内容 */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t bg-background">
                  <div className="mt-3 space-y-3">
                    {/* 代码 */}
                    <div>
                      <h4 className="text-xs font-semibold text-foreground mb-1">代码:</h4>
                      <pre className="text-xs bg-muted p-2 rounded border overflow-x-auto font-mono">
                        {item.code}
                      </pre>
                    </div>

                    {/* 输出 */}
                    {item.output && (
                      <div>
                        <h4 className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">输出:</h4>
                        <pre className="text-xs bg-muted p-2 rounded border overflow-x-auto font-mono text-green-600 dark:text-green-400 whitespace-pre-wrap">
                          {item.output}
                        </pre>
                      </div>
                    )}

                    {/* 错误 */}
                    {item.errors && (
                      <div>
                        <h4 className="text-xs font-semibold text-destructive mb-1">错误:</h4>
                        <pre className="text-xs bg-destructive/10 p-2 rounded border border-destructive overflow-x-auto font-mono text-destructive whitespace-pre-wrap">
                          {item.errors}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExecutionHistory;
