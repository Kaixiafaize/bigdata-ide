import React, { useState } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function Login({ onLogin, onSwitchToRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/bigdata-ide/auth/login`, {
        username: username.trim(),
        password,
      });
      const { access_token, username: u } = res.data;
      onLogin(access_token, u);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">登录</CardTitle>
          <p className="text-sm text-muted-foreground">登录后可使用文件管理与权限</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="用户名"
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </Button>
            {onSwitchToRegister && (
              <p className="text-center text-sm text-muted-foreground">
                没有账号？{' '}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={onSwitchToRegister}
                  disabled={loading}
                >
                  去注册
                </button>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
