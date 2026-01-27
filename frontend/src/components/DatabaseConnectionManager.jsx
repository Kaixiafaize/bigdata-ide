import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = '/api';

const DatabaseConnectionManager = ({ onConnectionSelect }) => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingConn, setEditingConn] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    database: '',
    username: '',
    password: '',
  });
  const [testing, setTesting] = useState(false);

  // 加载连接列表
  const loadConnections = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/bigdata-ide/database/connections`);
      setConnections(response.data.connections || []);
    } catch (err) {
      setError(`加载连接失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();
  }, []);

  // 保存连接
  const handleSave = async () => {
    if (!formData.name || !formData.host || !formData.database) {
      setError('请填写必填字段');
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (editingConn) {
        await axios.put(`${API_BASE_URL}/bigdata-ide/database/connections/${editingConn.id}`, formData);
      } else {
        await axios.post(`${API_BASE_URL}/bigdata-ide/database/connections`, formData);
      }
      setShowForm(false);
      setEditingConn(null);
      setFormData({
        name: '',
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: '',
        username: '',
        password: '',
      });
      loadConnections();
    } catch (err) {
      setError(`保存失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 测试连接
  const handleTest = async (connId) => {
    setTesting(true);
    setError('');
    try {
      const response = await axios.post(`${API_BASE_URL}/bigdata-ide/database/connections/${connId}/test`);
      alert('连接测试成功！');
    } catch (err) {
      setError(`连接测试失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setTesting(false);
    }
  };

  // 删除连接
  const handleDelete = async (connId) => {
    if (!confirm('确定要删除这个连接吗？')) return;

    setLoading(true);
    try {
      await axios.delete(`${API_BASE_URL}/bigdata-ide/database/connections/${connId}`);
      loadConnections();
    } catch (err) {
      setError(`删除失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 编辑连接
  const handleEdit = async (conn) => {
    setLoading(true);
    setError('');
    try {
      // 从后端获取完整连接信息
      const response = await axios.get(`${API_BASE_URL}/bigdata-ide/database/connections/${conn.id}`);
      const connData = response.data;
      
      setEditingConn(conn);
      setFormData({
        name: connData.name,
        type: connData.type,
        host: connData.host,
        port: connData.port,
        database: connData.database,
        username: connData.username,
        password: connData.password || '',  // 实际应用中密码应该加密
      });
      setShowForm(true);
    } catch (err) {
      setError(`加载连接信息失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 使用连接
  const handleUse = (conn) => {
    if (onConnectionSelect) {
      onConnectionSelect(conn.connection_string);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border">
      <div className="flex justify-between items-center px-4 py-3 border-b">
        <h3 className="text-lg font-semibold text-foreground">数据库连接管理</h3>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingConn(null);
            setFormData({
              name: '',
              type: 'postgres',
              host: 'localhost',
              port: 5432,
              database: '',
              username: '',
              password: '',
            });
          }}
          className="btn-primary text-xs"
        >
          ➕ 新建连接
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-l-4 border-destructive text-destructive text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading && !showForm && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            加载中...
          </div>
        )}

        {!loading && !showForm && connections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <p className="text-sm">暂无数据库连接</p>
            <p className="text-xs mt-2">点击"新建连接"添加数据库连接</p>
          </div>
        )}

        {!loading && !showForm && connections.map((conn) => (
          <div key={conn.id} className="p-4 bg-muted rounded-lg mb-3 border">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-semibold text-foreground">{conn.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {conn.type.toUpperCase()} • {conn.connection_string.split('@')[1] || conn.connection_string}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleUse(conn)}
                  className="btn-primary text-xs px-3 py-1"
                  title="使用此连接"
                >
                  使用
                </button>
                <button
                  onClick={() => handleTest(conn.id)}
                  disabled={testing}
                  className="btn-secondary text-xs px-3 py-1"
                  title="测试连接"
                >
                  {testing ? '测试中...' : '测试'}
                </button>
                <button
                  onClick={() => handleEdit(conn)}
                  className="btn-ghost text-xs px-3 py-1"
                  title="编辑"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(conn.id)}
                  className="btn-ghost text-xs px-3 py-1 text-destructive"
                  title="删除"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}

        {showForm && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">连接名称 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="input-field"
                placeholder="例如: 生产数据库"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">数据库类型 *</label>
              <select
                value={formData.type}
                onChange={(e) => {
                  const type = e.target.value;
                  setFormData({
                    ...formData,
                    type,
                    port: type === 'postgres' ? 5432 : 3306
                  });
                }}
                className="input-field"
              >
                <option value="postgres">PostgreSQL</option>
                <option value="starrocks">StarRocks</option>
                <option value="mysql">MySQL</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">主机 *</label>
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => setFormData({...formData, host: e.target.value})}
                  className="input-field"
                  placeholder="localhost"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">端口 *</label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({...formData, port: parseInt(e.target.value) || 5432})}
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">数据库名 *</label>
              <input
                type="text"
                value={formData.database}
                onChange={(e) => setFormData({...formData, database: e.target.value})}
                className="input-field"
                placeholder="database_name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">用户名 *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  className="input-field"
                  placeholder="username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">密码 *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="input-field"
                  placeholder="password"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingConn(null);
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="btn-primary"
              >
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseConnectionManager;
