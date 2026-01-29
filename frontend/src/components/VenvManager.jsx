import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { FolderPlus, Plus, Trash2, Check, Loader2, Box } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function VenvManager({ selectedVenvId, onSelectVenv, isActive }) {
  const [envs, setEnvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadEnvs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/bigdata-ide/envs`);
      setEnvs(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || '加载失败');
      setEnvs([]);
    } finally {
      setLoading(false);
    }
  };

  // 点开虚拟环境标签时拉取并列出所有虚拟环境
  useEffect(() => {
    if (isActive !== false) {
      loadEnvs();
    }
  }, [isActive]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/bigdata-ide/envs`, { name });
      setNewName('');
      setShowCreate(false);
      await loadEnvs();
    } catch (e) {
      setError(e.response?.data?.detail || e.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (venvId) => {
    if (!confirm(`确定删除虚拟环境「${venvId}」？`)) return;
    setDeletingId(venvId);
    setError('');
    try {
      await axios.delete(`${API_BASE_URL}/bigdata-ide/envs/${venvId}`);
      if (selectedVenvId === venvId) {
        onSelectVenv(null);
      }
      await loadEnvs();
    } catch (e) {
      setError(e.response?.data?.detail || e.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 overflow-auto">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Box className="h-4 w-4" />
              虚拟环境
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  新建
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>创建新的 Python 虚拟环境</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <p className="text-xs text-muted-foreground">
            选择的环境将作为代码执行时的 Python 解释器；不选则使用系统默认 kernel。
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">加载中...</span>
            </div>
          ) : envs.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无虚拟环境，点击「新建」创建。</p>
          ) : (
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <Button
                  variant={selectedVenvId === null ? 'secondary' : 'ghost'}
                  size="sm"
                  className="justify-start flex-1"
                  onClick={() => onSelectVenv(null)}
                >
                  {selectedVenvId === null && <Check className="h-4 w-4 mr-2" />}
                  <span className="truncate">系统默认</span>
                </Button>
              </li>
              {envs.map((env) => (
                <li key={env.id} className="flex items-center gap-2">
                  <Button
                    variant={selectedVenvId === env.id ? 'secondary' : 'ghost'}
                    size="sm"
                    className="justify-start flex-1 min-w-0"
                    onClick={() => onSelectVenv(env.id)}
                  >
                    {selectedVenvId === env.id && <Check className="h-4 w-4 mr-2 shrink-0" />}
                    <span className="truncate">{env.name}</span>
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive"
                        disabled={deletingId === env.id}
                        onClick={() => handleDelete(env.id)}
                      >
                        {deletingId === env.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>删除此虚拟环境</p>
                    </TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建虚拟环境</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>环境名称</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例如: myenv"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FolderPlus className="h-4 w-4 mr-1" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
