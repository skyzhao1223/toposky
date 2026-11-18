'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Drawer, Button, Modal, Input, Timeline, Tag, Popconfirm,
  message, Spin, Empty, Space, Descriptions, Table, Tooltip, Badge,
} from 'antd'
import {
  SaveOutlined, RollbackOutlined, DeleteOutlined, DiffOutlined,
  ClockCircleOutlined, NodeIndexOutlined, ApiOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import { VersionMeta, VersionDiff } from '@/types'

interface CommitLogItem {
  hash: string
  author: string
  date: string
  message: string
}

interface Props {
  open: boolean
  onClose: () => void
  hasChanges: boolean
  onRestore: (data: unknown) => void
}

export default function VersionManager({ open, onClose, hasChanges, onRestore }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [diffModalOpen, setDiffModalOpen] = useState(false)
  const [diffData, setDiffData] = useState<VersionDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffVersionName, setDiffVersionName] = useState('')
  const [history, setHistory] = useState<CommitLogItem[]>([])
  const [historyEnabled, setHistoryEnabled] = useState(false)

  const fetchVersions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/versions')
      const json = await res.json()
      setVersions(json.versions || [])
    } catch {
      message.error('加载版本列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history')
      const json = await res.json()
      setHistoryEnabled(!!json.enabled)
      setHistory(json.history || [])
    } catch {
      setHistoryEnabled(false)
      setHistory([])
    }
  }, [])

  useEffect(() => {
    // 抽屉打开时加载版本列表（异步 fetch，回调内 setState）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) { fetchVersions(); fetchHistory() }
  }, [open, fetchVersions, fetchHistory])

  const handleSave = async () => {
    if (!saveName.trim()) {
      message.warning('请输入版本名称')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName.trim(), description: saveDesc.trim() || undefined }),
      })
      const result = await res.json()
      if (result.success) {
        message.success('版本保存成功')
        setSaveModalOpen(false)
        setSaveName('')
        setSaveDesc('')
        fetchVersions()
      } else {
        message.error(result.error || '保存失败')
      }
    } catch {
      message.error('保存版本失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async (version: VersionMeta) => {
    try {
      const res = await fetch(`/api/versions/${version.id}/restore`, { method: 'POST' })
      const result = await res.json()
      if (result.success) {
        message.success(`已回滚到「${version.name}」，当前数据已自动备份`)
        onRestore(result.data)
        fetchVersions()
      } else {
        message.error(result.error || '回滚失败')
      }
    } catch {
      message.error('回滚失败')
    }
  }

  const handleDelete = async (version: VersionMeta) => {
    try {
      const res = await fetch(`/api/versions/${version.id}`, { method: 'DELETE' })
      const result = await res.json()
      if (result.success) {
        message.success('已删除')
        fetchVersions()
      } else {
        message.error(result.error || '删除失败')
      }
    } catch {
      message.error('删除失败')
    }
  }

  const handleDiff = async (version: VersionMeta) => {
    setDiffLoading(true)
    setDiffModalOpen(true)
    setDiffVersionName(version.name)
    setDiffData(null)
    try {
      const res = await fetch(`/api/versions/diff?from=${version.id}&to=current`)
      const result = await res.json()
      if (result.error) {
        message.error(result.error)
        setDiffModalOpen(false)
      } else {
        setDiffData(result)
      }
    } catch {
      message.error('加载差异失败')
      setDiffModalOpen(false)
    } finally {
      setDiffLoading(false)
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return (
    <>
      <Drawer
        title="版本管理"
        open={open}
        onClose={onClose}
        width={480}
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => setSaveModalOpen(true)}
            size="small"
          >
            保存版本
          </Button>
        }
      >
        {hasChanges && (
          <div className="mb-4 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-600">
            <ExclamationCircleOutlined className="mr-1" />
            当前有未保存的修改，建议先保存数据后再创建版本快照。
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Spin />
          </div>
        ) : versions.length === 0 ? (
          <Empty
            description="暂无版本记录"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => setSaveModalOpen(true)}>
              保存第一个版本
            </Button>
          </Empty>
        ) : (
          <Timeline
            items={versions.map((v) => ({
              color: v.name === '回滚前自动保存' ? 'orange' : 'blue',
              children: (
                <div className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{v.name}</span>
                      {v.name === '回滚前自动保存' && (
                        <Tag color="orange" className="text-[10px] leading-tight !px-1 !py-0 !mr-0">自动</Tag>
                      )}
                    </div>
                    <Space size={4}>
                      <Tooltip title="与当前对比">
                        <Button size="small" type="text" icon={<DiffOutlined />} onClick={() => handleDiff(v)} />
                      </Tooltip>
                      <Popconfirm
                        title="回滚确认"
                        description={
                          <span className="text-xs">
                            将回滚到「{v.name}」版本。<br />当前数据会自动保存为新版本。
                          </span>
                        }
                        onConfirm={() => handleRestore(v)}
                        okText="确认回滚"
                        cancelText="取消"
                      >
                        <Tooltip title="回滚到此版本">
                          <Button size="small" type="text" icon={<RollbackOutlined />} />
                        </Tooltip>
                      </Popconfirm>
                      <Popconfirm
                        title="确认删除此版本？"
                        onConfirm={() => handleDelete(v)}
                        okText="删除"
                        cancelText="取消"
                      >
                        <Tooltip title="删除">
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                      </Popconfirm>
                    </Space>
                  </div>
                  {v.description && (
                    <div className="text-xs text-gray-500 mt-0.5">{v.description}</div>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1">
                    <span><ClockCircleOutlined className="mr-0.5" />{formatTime(v.createdAt)}</span>
                    <span><NodeIndexOutlined className="mr-0.5" />{v.nodeCount} 节点</span>
                    <span><ApiOutlined className="mr-0.5" />{v.relationCount} 关系</span>
                    <span>{formatSize(v.size)}</span>
                  </div>
                </div>
              ),
            }))}
          />
        )}

        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="text-sm font-medium text-gray-700 mb-2">Git 提交审计</div>
          {!historyEnabled ? (
            <div className="text-xs text-gray-400 bg-gray-50 rounded p-2 leading-relaxed">
              项目不是 git 仓库，提交审计未启用。在项目根目录执行 git init 后，每次保存将自动记录一次提交（作者取右上角「维护者身份」）。
            </div>
          ) : history.length === 0 ? (
            <div className="text-xs text-gray-400">暂无提交记录</div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {history.map((h) => (
                <div key={h.hash} className="flex items-start gap-2 text-xs">
                  <span className="font-mono text-blue-500 flex-shrink-0">{h.hash.slice(0, 7)}</span>
                  <span className="text-gray-700 flex-1 break-all">{h.message}</span>
                  <span className="text-gray-400 flex-shrink-0">{h.author}</span>
                  <span className="text-gray-300 flex-shrink-0">{formatTime(h.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Drawer>

      <Modal
        title="保存版本"
        open={saveModalOpen}
        onOk={handleSave}
        onCancel={() => { setSaveModalOpen(false); setSaveName(''); setSaveDesc('') }}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <div className="space-y-3 mt-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">版本名称 *</div>
            <Input
              placeholder="例如：v1.0 初始版本"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onPressEnter={handleSave}
              maxLength={50}
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">版本描述</div>
            <Input.TextArea
              placeholder="描述本次变更内容（可选）"
              value={saveDesc}
              onChange={(e) => setSaveDesc(e.target.value)}
              rows={3}
              maxLength={200}
              showCount
            />
          </div>
        </div>
      </Modal>

      <Modal
        title={`差异对比：「${diffVersionName}」→ 当前`}
        open={diffModalOpen}
        onCancel={() => setDiffModalOpen(false)}
        footer={null}
        width={680}
      >
        {diffLoading ? (
          <div className="flex justify-center py-8"><Spin /></div>
        ) : diffData ? (
          <div className="space-y-4">
            <Descriptions size="small" bordered column={3}>
              <Descriptions.Item label="新增节点">
                <Badge count={diffData.addedNodes.length} showZero color={diffData.addedNodes.length > 0 ? 'green' : 'default'} />
              </Descriptions.Item>
              <Descriptions.Item label="删除节点">
                <Badge count={diffData.removedNodes.length} showZero color={diffData.removedNodes.length > 0 ? 'red' : 'default'} />
              </Descriptions.Item>
              <Descriptions.Item label="修改节点">
                <Badge count={diffData.modifiedNodes.length} showZero color={diffData.modifiedNodes.length > 0 ? 'blue' : 'default'} />
              </Descriptions.Item>
              <Descriptions.Item label="新增关系">
                <Badge count={diffData.addedRelations.length} showZero color={diffData.addedRelations.length > 0 ? 'green' : 'default'} />
              </Descriptions.Item>
              <Descriptions.Item label="删除关系">
                <Badge count={diffData.removedRelations.length} showZero color={diffData.removedRelations.length > 0 ? 'red' : 'default'} />
              </Descriptions.Item>
              <Descriptions.Item label="修改关系">
                <Badge count={diffData.modifiedRelations.length} showZero color={diffData.modifiedRelations.length > 0 ? 'blue' : 'default'} />
              </Descriptions.Item>
            </Descriptions>

            <div className="text-xs text-gray-500">{diffData.summary}</div>

            {(diffData.addedNodes.length > 0 || diffData.removedNodes.length > 0 || diffData.modifiedNodes.length > 0) && (
              <div>
                <div className="text-sm font-medium mb-2">节点变更</div>
                <Table
                  size="small"
                  pagination={false}
                  scroll={{ y: 200 }}
                  dataSource={[
                    ...diffData.addedNodes.map((n) => ({ ...n, type: 'added' as const, changes: [] })),
                    ...diffData.removedNodes.map((n) => ({ ...n, type: 'removed' as const, changes: [] })),
                    ...diffData.modifiedNodes.map((n) => ({ ...n, type: 'modified' as const })),
                  ]}
                  rowKey="id"
                  columns={[
                    {
                      title: '类型', dataIndex: 'type', width: 60,
                      render: (t: string) => (
                        <Tag color={t === 'added' ? 'green' : t === 'removed' ? 'red' : 'blue'} className="!mr-0">
                          {t === 'added' ? '新增' : t === 'removed' ? '删除' : '修改'}
                        </Tag>
                      ),
                    },
                    { title: 'ID', dataIndex: 'id', width: 140, ellipsis: true },
                    { title: '名称', dataIndex: 'name', width: 140, ellipsis: true },
                    {
                      title: '变更字段', dataIndex: 'changes',
                      render: (changes: string[]) =>
                        changes.length > 0 ? (
                          <span className="text-xs text-gray-500">{changes.join(', ')}</span>
                        ) : '-',
                    },
                  ]}
                />
              </div>
            )}

            {(diffData.addedRelations.length > 0 || diffData.removedRelations.length > 0 || diffData.modifiedRelations.length > 0) && (
              <div>
                <div className="text-sm font-medium mb-2">关系变更</div>
                <Table
                  size="small"
                  pagination={false}
                  scroll={{ y: 200 }}
                  dataSource={[
                    ...diffData.addedRelations.map((r) => ({ ...r, type: 'added' as const, changes: [] })),
                    ...diffData.removedRelations.map((r) => ({ ...r, type: 'removed' as const, changes: [] })),
                    ...diffData.modifiedRelations.map((r) => ({ ...r, type: 'modified' as const, source: '', target: '' })),
                  ]}
                  rowKey="id"
                  columns={[
                    {
                      title: '类型', dataIndex: 'type', width: 60,
                      render: (t: string) => (
                        <Tag color={t === 'added' ? 'green' : t === 'removed' ? 'red' : 'blue'} className="!mr-0">
                          {t === 'added' ? '新增' : t === 'removed' ? '删除' : '修改'}
                        </Tag>
                      ),
                    },
                    { title: 'ID', dataIndex: 'id', width: 100, ellipsis: true },
                    { title: 'Source', dataIndex: 'source', width: 120, ellipsis: true },
                    { title: 'Target', dataIndex: 'target', width: 120, ellipsis: true },
                    {
                      title: '变更字段', dataIndex: 'changes',
                      render: (changes: string[]) =>
                        changes.length > 0 ? (
                          <span className="text-xs text-gray-500">{changes.join(', ')}</span>
                        ) : '-',
                    },
                  ]}
                />
              </div>
            )}

            {diffData.summary === '无变更' && (
              <Empty description="两个版本完全一致" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        ) : null}
      </Modal>
    </>
  )
}
